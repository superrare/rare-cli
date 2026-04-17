import { ExactEvmScheme } from '@x402/evm';
import { wrapFetchWithPayment, x402Client, x402HTTPClient } from '@x402/fetch';
import type { WalletClient } from 'viem';
import { chainIds, type SupportedChain } from '../contracts/addresses.js';

type WalletAccount = NonNullable<WalletClient['account']>;

export interface CreateX402PaymentFetchOptions {
  paymentChain: SupportedChain;
  rpcUrl: string;
  account: WalletAccount;
  fetchImpl?: typeof fetch;
}

export function createX402PaymentFetch(opts: CreateX402PaymentFetchOptions): typeof fetch {
  const client = new x402Client();
  const chainId = chainIds[opts.paymentChain];

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
  return wrapFetchWithPayment(opts.fetchImpl ?? fetch, httpClient);
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
