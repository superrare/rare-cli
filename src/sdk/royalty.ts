import { type Address, type PublicClient, isAddressEqual } from 'viem';
import { royaltyEngineAbi } from '../contracts/abis/royalty-engine.js';
import { royaltyRegistryAbi } from '../contracts/abis/royalty-registry.js';
import { requireContractAddress, type SupportedChain } from '../contracts/addresses.js';
import type { RareClientConfig } from './types/client.js';
import type { RoyaltyNamespace } from './types/royalty.js';
import { requireWallet } from './wallet-shell.js';
import { toNonNegativeInteger } from './amounts-core.js';

export type * from './types/royalty.js';

export function createRoyaltyNamespace(
  publicClient: PublicClient,
  config: RareClientConfig,
  chain: SupportedChain,
): RoyaltyNamespace {
  return {
    async status(params): ReturnType<RoyaltyNamespace['status']> {
      const engine = requireContractAddress(chain, 'royaltyEngine');
      const registry = requireContractAddress(chain, 'royaltyRegistry');
      const tokenId = toNonNegativeInteger(params.tokenId, 'tokenId');
      const price = params.price === undefined ? 10_000n : toNonNegativeInteger(params.price, 'price');

      const [royalty, lookupAddress] = await Promise.all([
        publicClient.readContract({
          address: engine,
          abi: royaltyEngineAbi,
          functionName: 'getRoyaltyView',
          args: [params.contract, tokenId, price],
        }),
        publicClient.readContract({
          address: registry,
          abi: royaltyRegistryAbi,
          functionName: 'getRoyaltyLookupAddress',
          args: [params.contract],
        }),
      ]);

      const [receivers, amounts] = royalty;
      const recipients = receivers.map((receiver: Address, index: number) => ({
        receiver,
        amount: amounts[index] ?? 0n,
      }));
      const totalAmount = amounts.reduce((sum: bigint, amount: bigint) => sum + amount, 0n);

      return {
        contract: params.contract,
        tokenId,
        price,
        recipients,
        totalAmount,
        lookupAddress,
        overrideActive: !isAddressEqual(lookupAddress, params.contract),
      };
    },

    async setOverride(params): ReturnType<RoyaltyNamespace['setOverride']> {
      const registry = requireContractAddress(chain, 'royaltyRegistry');
      const { walletClient, account } = requireWallet(config);

      const txHash = await walletClient.writeContract({
        address: registry,
        abi: royaltyRegistryAbi,
        functionName: 'setRoyaltyLookupAddress',
        args: [params.contract, params.lookupAddress],
        account,
        chain: undefined,
      });

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return {
        txHash,
        receipt,
        contract: params.contract,
        lookupAddress: params.lookupAddress,
      };
    },
  };
}
