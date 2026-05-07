import { type Address, type Hash, type PublicClient } from 'viem';
import { batchListingAbi } from '../contracts/abis/batch-listing.js';
import type { RareClientConfig, RareClient } from './types.js';
import {
  ETH_ADDRESS,
  approvalAbi,
  preparePayment,
  requireWallet,
  toInteger,
  toWei,
  waitForApproval,
} from './helpers.js';

const ZERO_ADDRESS = '0x0000000000000000000000000000000000000000' as const;
const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

export function createBatchListingNamespace(
  publicClient: PublicClient,
  config: RareClientConfig,
  addresses: { batchListing: Address; erc721ApprovalManager: Address },
): RareClient['batchListing'] {
  return {
    async create(params) {
      const { walletClient, account, accountAddress } = requireWallet(config);
      const { artifact } = params;

      if (!artifact.tokens.length) {
        throw new Error('Root artifact must contain at least one token');
      }

      const uniqueContracts = Array.from(
        new Set(artifact.tokens.map((t) => t.contract.toLowerCase())),
      ) as Address[];

      const ownerSampleSize = Math.min(3, artifact.tokens.length);
      for (let i = 0; i < ownerSampleSize; i++) {
        const t = artifact.tokens[i]!;
        const owner = (await publicClient.readContract({
          address: t.contract,
          abi: [
            {
              type: 'function',
              name: 'ownerOf',
              inputs: [{ name: 'tokenId', type: 'uint256' }],
              outputs: [{ name: '', type: 'address' }],
              stateMutability: 'view',
            },
          ] as const,
          functionName: 'ownerOf',
          args: [BigInt(t.tokenId)],
        })) as Address;
        if (owner.toLowerCase() !== accountAddress.toLowerCase()) {
          throw new Error(
            `Token ${t.contract}/${t.tokenId} is owned by ${owner}, not the configured account ${accountAddress}. ` +
              `Re-check the token set before registering this batch listing.`,
          );
        }
      }

      const approvalTxHashes: Hash[] = [];
      if (params.autoApprove !== false) {
        for (const nftAddress of uniqueContracts) {
          const isApproved = await publicClient.readContract({
            address: nftAddress,
            abi: approvalAbi,
            functionName: 'isApprovedForAll',
            args: [accountAddress, addresses.erc721ApprovalManager],
          });
          if (!isApproved) {
            const approvalTxHash = await walletClient.writeContract({
              address: nftAddress,
              abi: approvalAbi,
              functionName: 'setApprovalForAll',
              args: [addresses.erc721ApprovalManager, true],
              account,
              chain: undefined,
            });
            await publicClient.waitForTransactionReceipt({ hash: approvalTxHash });
            await waitForApproval(publicClient, nftAddress, accountAddress, addresses.erc721ApprovalManager);
            approvalTxHashes.push(approvalTxHash);
          }
        }
      }

      const txHash = await walletClient.writeContract({
        address: addresses.batchListing,
        abi: batchListingAbi,
        functionName: 'registerSalePriceMerkleRoot',
        args: [
          artifact.root,
          artifact.currency,
          BigInt(artifact.amount),
          artifact.splitAddresses,
          artifact.splitRatios,
        ],
        account,
        chain: undefined,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt, approvalTxHashes: approvalTxHashes.length ? approvalTxHashes : undefined };
    },

    async cancel(params) {
      const { walletClient, account } = requireWallet(config);
      const txHash = await walletClient.writeContract({
        address: addresses.batchListing,
        abi: batchListingAbi,
        functionName: 'cancelSalePriceMerkleRoot',
        args: [params.root],
        account,
        chain: undefined,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt };
    },

    async buy(params) {
      const { walletClient, account, accountAddress } = requireWallet(config);

      const amount = toWei(params.amount);
      const tokenIdBig = toInteger(params.proofArtifact.tokenId, 'tokenId');
      const allowListProof = params.proofArtifact.allowListProof ?? [];

      const value = await preparePayment({
        publicClient,
        walletClient,
        account,
        accountAddress,
        auctionAddress: addresses.batchListing,
        currency: params.currency,
        amount,
      });

      const txHash = await walletClient.writeContract({
        address: addresses.batchListing,
        abi: batchListingAbi,
        functionName: 'buyWithMerkleProof',
        args: [
          params.proofArtifact.contract,
          tokenIdBig,
          params.currency,
          amount,
          params.creator,
          params.proofArtifact.root,
          params.proofArtifact.proof,
          allowListProof,
        ],
        account,
        chain: undefined,
        value,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt };
    },

    async setAllowList(params) {
      const { walletClient, account } = requireWallet(config);
      const txHash = await walletClient.writeContract({
        address: addresses.batchListing,
        abi: batchListingAbi,
        functionName: 'setAllowListConfig',
        args: [params.root, params.allowListRoot, toInteger(params.endTimestamp, 'endTimestamp')],
        account,
        chain: undefined,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt };
    },

    async getStatus(params) {
      const config = (await publicClient.readContract({
        address: addresses.batchListing,
        abi: batchListingAbi,
        functionName: 'getMerkleSalePriceConfig',
        args: [params.creator, params.root],
      })) as {
        currency: Address;
        amount: bigint;
        splitRecipients: readonly Address[];
        splitRatios: readonly number[];
        nonce: bigint;
      };

      const cancellationNonce = (await publicClient.readContract({
        address: addresses.batchListing,
        abi: batchListingAbi,
        functionName: 'getCreatorSalePriceMerkleRootNonce',
        args: [params.creator, params.root],
      })) as bigint;

      const hasListing =
        config.amount > 0n && config.currency !== ZERO_ADDRESS && cancellationNonce === config.nonce;

      let allowList: { root: `0x${string}`; endTimestamp: bigint } | undefined;
      try {
        const al = (await publicClient.readContract({
          address: addresses.batchListing,
          abi: batchListingAbi,
          functionName: 'getAllowListConfig',
          args: [params.creator, params.root],
        })) as { root: `0x${string}`; endTimestamp: bigint };
        if (al.root !== ZERO_BYTES32) {
          allowList = { root: al.root, endTimestamp: al.endTimestamp };
        }
      } catch {
        // contract may revert if no allowlist set; treat as absent
      }

      let tokenInRoot: boolean | undefined;
      let tokenNonce: bigint | undefined;
      if (params.contract && params.tokenId !== undefined && params.proof) {
        tokenInRoot = (await publicClient.readContract({
          address: addresses.batchListing,
          abi: batchListingAbi,
          functionName: 'isTokenInRoot',
          args: [params.root, params.contract, toInteger(params.tokenId, 'tokenId'), params.proof],
        })) as boolean;
        tokenNonce = (await publicClient.readContract({
          address: addresses.batchListing,
          abi: batchListingAbi,
          functionName: 'getTokenSalePriceNonce',
          args: [params.creator, params.root, params.contract, toInteger(params.tokenId, 'tokenId')],
        })) as bigint;
      }

      return {
        root: params.root,
        seller: params.creator,
        currencyAddress: config.currency,
        amount: config.amount,
        splitRecipients: [...config.splitRecipients],
        splitRatios: [...config.splitRatios],
        nonce: config.nonce,
        isEth: config.currency === ETH_ADDRESS,
        hasListing,
        allowList,
        tokenInRoot,
        tokenNonce,
      };
    },
  };
}
