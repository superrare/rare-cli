import { spawn } from 'node:child_process';
import type { Account, WalletClient } from 'viem';

/**
 * The exact message the SuperRare web app signs to authenticate a wallet.
 * Keep in sync with `use-verify-wallet-owner.ts` in the monorepo.
 */
const SIGN_IN_MESSAGE =
  'SuperRare uses this cryptographic signature in place of a password, verifying that you are the owner of this Ethereum address. By clicking "Sign" you agree to our Terms of Service and consent to our usage of your data as described in our Privacy Notice.';

/** Collapses Set-Cookie response headers into a single `Cookie` request header. */
function extractCookieHeader(response: Response): string {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };
  const setCookies =
    headers.getSetCookie?.() ??
    (response.headers.get('set-cookie') ?? '').split(/,(?=[^;]+=)/);
  return setCookies
    .map((cookie) => cookie.split(';')[0]?.trim())
    .filter((pair): pair is string => Boolean(pair))
    .join('; ');
}

/**
 * Logs in to the SuperRare web app with a wallet signature (no password) and
 * returns a `Cookie` header carrying the session for follow-up requests.
 */
export async function loginWithWallet(params: {
  webBaseUrl: string;
  walletClient: WalletClient;
  account: Account;
}): Promise<string> {
  const { webBaseUrl, walletClient, account } = params;

  const signature = await walletClient.signMessage({
    account,
    message: SIGN_IN_MESSAGE,
  });

  const response = await fetch(`${webBaseUrl}/api/next/auth/login?cookies=true`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ signature, address: account.address }),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw new Error(
      `SuperRare login failed (${response.status})${text ? `: ${text}` : ''}`
    );
  }

  const cookieHeader = extractCookieHeader(response);
  if (!cookieHeader) {
    throw new Error('SuperRare login did not return a session cookie.');
  }
  return cookieHeader;
}

export interface PrepareCardCheckoutBody {
  tokenContractAddress: string;
  tokenId: string;
  weiPrice: string;
  marketplaceAddress: string;
  currencyAddress: string;
  buyerAddress: string;
  email: string;
  universalTokenId: string;
}

/**
 * Asks the SuperRare backend to prepare a Coinflow card checkout (bound to the
 * authenticated wallet) and returns the absolute URL of the hosted checkout page.
 */
export async function prepareCardCheckout(params: {
  webBaseUrl: string;
  cookieHeader: string;
  body: PrepareCardCheckoutBody;
}): Promise<{ checkoutUrl: string }> {
  const { webBaseUrl, cookieHeader, body } = params;

  const response = await fetch(`${webBaseUrl}/api/next/checkout/coinflow/prepare`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Cookie: cookieHeader,
    },
    body: JSON.stringify(body),
  });

  const text = await response.text();
  if (!response.ok) {
    let message = text;
    try {
      message = (JSON.parse(text) as { error?: string }).error ?? text;
    } catch {
      // response body wasn't JSON — keep the raw text
    }
    throw new Error(
      `Failed to prepare card checkout (${response.status})${message ? `: ${message}` : ''}`
    );
  }

  const json = JSON.parse(text) as { checkoutPath?: string };
  if (!json.checkoutPath) {
    throw new Error('Prepare response did not include a checkout path.');
  }
  return { checkoutUrl: `${webBaseUrl}${json.checkoutPath}` };
}

/** Opens a URL in the user's default browser (best-effort, cross-platform). */
export function openBrowser(url: string): void {
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
