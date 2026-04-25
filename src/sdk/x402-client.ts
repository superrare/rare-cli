import { ExactEvmScheme } from '@x402/evm';
import { x402Client, x402HTTPClient } from '@x402/fetch';
import type { WalletClient } from 'viem';
import { chainIds, type SupportedChain } from '../contracts/addresses.js';

type WalletAccount = NonNullable<WalletClient['account']>;
type PaymentRequiredResponse = ReturnType<x402HTTPClient['getPaymentRequiredResponse']>;

const MAX_PAYMENT_REQUIRED_RETRIES = 3;

export interface CreateX402PaymentFetchOptions {
  paymentChain: SupportedChain;
  rpcUrl: string;
  account: WalletAccount;
  fetchImpl?: typeof fetch;
}

export function createX402PaymentFetch(opts: CreateX402PaymentFetchOptions): typeof fetch {
  const client = new x402Client();
  const chainId = chainIds[opts.paymentChain];
  const baseFetch = opts.fetchImpl ?? fetch;

  client
    .register(`eip155:${chainId}`, new ExactEvmScheme(opts.account, { [chainId]: { rpcUrl: opts.rpcUrl } }))
    .onBeforePaymentCreation(async ({ paymentRequired }) => {
      if (!paymentRequired.extensions || typeof paymentRequired.extensions !== 'object') {
        return;
      }

      const extension = paymentRequired.extensions['payment-identifier'];
      if (!isPaymentIdentifierDeclaration(extension)) {
        return;
      }

      paymentRequired.extensions = {
        ...paymentRequired.extensions,
        'payment-identifier': {
          ...extension,
          info: {
            ...extension.info,
            id: generatePaymentIdentifier(),
          },
        },
      };
    });

  const httpClient = new x402HTTPClient(client);
  return async (input, init) => {
    const requestTemplate = new Request(input, init);
    let response = await baseFetch(requestTemplate.clone());
    let retries = 0;

    // Some sellers refresh time-sensitive payment requirements, such as
    // maxTimeoutSeconds, between the initial 402 challenge and the paid retry.
    // Regenerate the payment payload from the latest challenge a few times
    // before giving up so the upload-session flow survives that drift.
    while (response.status === 402 && retries < MAX_PAYMENT_REQUIRED_RETRIES) {
      const paymentRequired = await readPaymentRequiredResponse(httpClient, response);
      if (!paymentRequired) {
        return response;
      }

      const hookHeaders = await httpClient.handlePaymentRequired(paymentRequired);
      if (hookHeaders) {
        const hookRequest = requestTemplate.clone();
        for (const [key, value] of Object.entries(hookHeaders)) {
          hookRequest.headers.set(key, value);
        }

        const hookResponse = await baseFetch(hookRequest);
        if (hookResponse.status !== 402) {
          return hookResponse;
        }

        const refreshedPaymentRequired = await readPaymentRequiredResponse(httpClient, hookResponse);
        if (refreshedPaymentRequired) {
          response = hookResponse;
        }
      }

      const latestPaymentRequired = await readPaymentRequiredResponse(httpClient, response);
      if (!latestPaymentRequired) {
        return response;
      }

      const paymentPayload = await client.createPaymentPayload(latestPaymentRequired);
      const paymentHeaders = httpClient.encodePaymentSignatureHeader(paymentPayload);
      const paidRequest = requestTemplate.clone();

      if (paidRequest.headers.has('PAYMENT-SIGNATURE') || paidRequest.headers.has('X-PAYMENT')) {
        throw new Error('Payment already attempted');
      }

      for (const [key, value] of Object.entries(paymentHeaders)) {
        paidRequest.headers.set(key, value);
      }
      paidRequest.headers.set('Access-Control-Expose-Headers', 'PAYMENT-RESPONSE,X-PAYMENT-RESPONSE');

      response = await baseFetch(paidRequest);
      if (response.status !== 402) {
        return response;
      }

      retries += 1;
    }

    return response;
  };
}

async function readPaymentRequiredResponse(
  httpClient: x402HTTPClient,
  response: Response,
): Promise<PaymentRequiredResponse | null> {
  try {
    const cloned = response.clone();
    let body: unknown;

    try {
      const text = await cloned.text();
      if (text) {
        body = JSON.parse(text) as unknown;
      }
    } catch {
      body = undefined;
    }

    return httpClient.getPaymentRequiredResponse((name) => response.headers.get(name), body);
  } catch {
    return null;
  }
}

function generatePaymentIdentifier(prefix = 'pres_'): string {
  return `${prefix}${crypto.randomUUID().replace(/-/g, '')}`;
}

function isPaymentIdentifierDeclaration(
  value: unknown,
): value is { info: { required: boolean; id?: string } } {
  if (!value || typeof value !== 'object') return false;
  const info = (value as { info?: unknown }).info;
  return Boolean(info && typeof info === 'object' && typeof (info as { required?: unknown }).required === 'boolean');
}
