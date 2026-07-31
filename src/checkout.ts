import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { RareApiError } from '@rareprotocol/rare-sdk/data-access/errors';
import type { ApiClient } from '@rareprotocol/rare-sdk/data-access';
import type { components } from '@rareprotocol/rare-sdk/data-access/schema';

type ConnectIntent = components['schemas']['ConnectIntent'];

/**
 * Coinflow card limits, mirrored from the SuperRare backend (which re-enforces
 * them when preparing the card checkout): charges must be at least $10.50 and
 * listings must be priced under $5,000. USDC has 6 decimals; one cent is 10^4
 * base units, rounded up.
 */
const COINFLOW_MINIMUM_CENTS = 1050n;
const COINFLOW_MAXIMUM_LISTING_CENTS = 500_000n;

function usdcBaseUnitsToCents(baseUnits: bigint): bigint {
  return (baseUnits + 9999n) / 10000n;
}

/**
 * Returns the reason a USDC listing cannot be bought by card, or null when it
 * can. Checked up front so the user gets a specific CLI error instead of a
 * hosted checkout page without a card option.
 */
export function getCardListingGateError(usdcBaseUnits: bigint): string | null {
  const cents = usdcBaseUnitsToCents(usdcBaseUnits);
  if (cents < COINFLOW_MINIMUM_CENTS) {
    return 'Card payments require a minimum of $10.50.';
  }
  if (cents >= COINFLOW_MAXIMUM_LISTING_CENTS) {
    return 'Card payments are only available on listings under $5,000.';
  }
  return null;
}

export type ConnectIntentProgress =
  | { kind: 'wait'; status: ConnectIntent['status'] }
  | { kind: 'settled'; transactionHash?: string }
  | { kind: 'failed'; message: string };

/**
 * Classifies a polled Connect intent for the buy-card wait loop. A card
 * checkout currently finishes as `processing` carrying the Coinflow settlement
 * transaction hash (the backend marks it `completed` once it can verify proxy
 * settlements), so a present transaction hash counts as settled.
 */
export function resolveConnectIntentProgress(intent: ConnectIntent): ConnectIntentProgress {
  if (intent.status === 'failed' || intent.status === 'cancelled' || intent.status === 'expired') {
    return {
      kind: 'failed',
      message: intent.error?.message ?? `The checkout was ${intent.status}.`,
    };
  }
  if (intent.status === 'completed' || intent.result?.transactionHash !== undefined) {
    return { kind: 'settled', transactionHash: intent.result?.transactionHash };
  }
  return { kind: 'wait', status: intent.status };
}

/**
 * rare-api requires an HTTPS Origin header on intent creation (browsers send it
 * automatically; the CLI sets it explicitly). It also becomes the return target:
 * if the buyer pays with crypto instead of card, the hosted flow sends them
 * back to this origin when done.
 */
const CLI_INITIATING_ORIGIN = 'https://studio.superrare.com';

export type PreparedConnectCheckout = {
  intentId: string;
  url: string;
  expiresAt: string;
};

/**
 * Creates a SuperRare Connect buy intent for a public USDC listing and returns
 * the hosted checkout URL. The buyer connects the receiving wallet and pays
 * (card or crypto) in the browser; the CLI never handles keys or signatures.
 */
export async function createConnectBuyIntent(params: {
  client: ApiClient;
  chainId: number;
  contract: string;
  tokenId: string;
  priceUsdcBaseUnits: bigint;
  /**
   * Card-direct hints: when the CLI already knows the receiving wallet, the
   * hosted flow offers card payment without a connect-wallet step and the
   * checkout stays bound to this recipient server-side.
   */
  recipient?: string;
  email?: string;
}): Promise<PreparedConnectCheckout> {
  const { client, chainId, contract, tokenId, priceUsdcBaseUnits, recipient, email } = params;

  const { data } = await client.POST('/v1/connect/intents', {
    headers: { Origin: CLI_INITIATING_ORIGIN },
    body: {
      action: {
        type: 'buy',
        target: { kind: 'erc721-direct-listing', chainId, contract, tokenId },
        // Server-side price/currency re-validation: intent creation fails if
        // the listing changed since the CLI read it on-chain.
        expected: { currency: 'USDC', price: priceUsdcBaseUnits.toString() },
      },
      state: randomUUID(),
      ...(recipient === undefined
        ? {}
        : {
            payment: {
              method: 'card' as const,
              recipient,
              ...(email === undefined ? {} : { email }),
            },
          }),
    },
  });

  if (data === undefined) {
    throw new Error('SuperRare API returned an empty create-intent response.');
  }
  return data.data;
}

const TIMEOUT_MESSAGE =
  'Timed out waiting for the checkout (the intent expired). If you completed the payment, the NFT will still arrive in the connected wallet.';

/**
 * Polls the Connect intent until the payment settles (returns the settlement
 * transaction hash when Coinflow reported one), the checkout fails, or the
 * intent expires. A 404/410 from the API ends the wait immediately (the intent
 * is gone); other poll errors are treated as transient until the deadline.
 */
export async function waitForConnectSettlement(params: {
  client: ApiClient;
  intentId: string;
  expiresAt: string;
  onStatusChange?: (status: string) => void;
  pollIntervalMs?: number;
}): Promise<{ transactionHash?: string }> {
  const { client, intentId, expiresAt, onStatusChange } = params;
  // Small grace period past the intent TTL so a payment made near expiry can
  // still surface its final status before we give up. Guard against an
  // unparseable expiresAt: NaN comparisons would otherwise never time out.
  const expiresAtMs = Date.parse(expiresAt);
  const deadline = Number.isFinite(expiresAtMs)
    ? expiresAtMs + 60_000
    : Date.now() + 16 * 60_000;

  return await pollForSettlement({
    client,
    intentId,
    deadline,
    onStatusChange,
    pollIntervalMs: params.pollIntervalMs ?? 4000,
    lastStatus: '',
  });
}

/**
 * One poll step, recursing after the interval. Async recursion does not grow
 * the call stack (each await unwinds before the next step starts).
 */
async function pollForSettlement(input: {
  client: ApiClient;
  intentId: string;
  deadline: number;
  onStatusChange?: (status: string) => void;
  pollIntervalMs: number;
  lastStatus: string;
}): Promise<{ transactionHash?: string }> {
  const intent = await fetchIntentForPoll(input.client, input.intentId);

  if (intent !== undefined) {
    if (intent.status !== input.lastStatus) {
      input.onStatusChange?.(intent.status);
    }
    const progress = resolveConnectIntentProgress(intent);
    if (progress.kind === 'settled') {
      return { transactionHash: progress.transactionHash };
    }
    if (progress.kind === 'failed') {
      throw new Error(progress.message);
    }
  }

  if (Date.now() > input.deadline) {
    throw new Error(TIMEOUT_MESSAGE);
  }
  await sleep(input.pollIntervalMs);
  return await pollForSettlement({
    ...input,
    lastStatus: intent?.status ?? input.lastStatus,
  });
}

/**
 * Reads the intent for one poll step. A 404/410 means the intent is gone —
 * that ends the wait immediately; any other error (network blip, 5xx) is
 * transient and returns undefined so polling continues until the deadline.
 */
async function fetchIntentForPoll(
  client: ApiClient,
  intentId: string,
): Promise<ConnectIntent | undefined> {
  try {
    const { data } = await client.GET('/v1/connect/intents/{intentId}', {
      params: { path: { intentId } },
    });
    return data?.data;
  } catch (error) {
    if (
      error instanceof RareApiError &&
      (error.status === 404 || error.status === 410)
    ) {
      throw new Error(TIMEOUT_MESSAGE);
    }
    return undefined;
  }
}

async function sleep(milliseconds: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
}

/** Chromium-family browsers (macOS) that support a chromeless `--app` window. */
const MACOS_CHROMIUM_BINARIES = [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
];

/**
 * Opens the checkout. Prefers a small, chromeless Chromium "app" window (its own
 * window, no tabs/address bar, sized to the component) so only the checkout
 * shows; falls back to the default browser when no Chromium browser is found.
 */
export function openBrowser(url: string): void {
  if (process.platform === 'darwin') {
    const browser = MACOS_CHROMIUM_BINARIES.find((path) => existsSync(path));
    if (browser !== undefined) {
      const child = spawn(
        browser,
        [`--app=${url}`, '--window-size=440,720'],
        { stdio: 'ignore', detached: true },
      );
      // If the app window can't launch, fall back to a normal browser open.
      child.on('error', () => {
        fallbackOpenBrowser(url);
      });
      child.unref();
      return;
    }
  }
  fallbackOpenBrowser(url);
}

/** Opens a URL in the user's default browser (best-effort, cross-platform). */
function fallbackOpenBrowser(url: string): void {
  const command =
    process.platform === 'darwin'
      ? 'open'
      : process.platform === 'win32'
        ? 'cmd'
        : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];

  const child = spawn(command, args, { stdio: 'ignore', detached: true });
  // Non-fatal if the browser can't be launched; the URL is printed for manual use.
  child.on('error', () => {});
  child.unref();
}
