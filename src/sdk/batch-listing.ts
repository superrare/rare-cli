import { isAddressEqual, type Address, type Hash, type PublicClient } from 'viem';
import { batchListingAbi } from '../contracts/abis/batch-listing.js';
import { ETH_ADDRESS } from '../contracts/addresses.js';
import type {
  BatchListingCreateResult,
  BatchListingStatus,
  RareClient,
  RareClientConfig,
  TransactionResult,
} from './types.js';
import {
  approvalAbi,
  preparePayment,
  requireWallet,
  toInteger,
  toWei,
  waitForApproval,
} from './helpers.js';

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

export function createBatchListingNamespace(
  publicClient: PublicClient,
  config: RareClientConfig,
  addresses: { batchListing: Address; erc721ApprovalManager: Address },
): RareClient['batchListing'] {
  return {
    async create(params): Promise<BatchListingCreateResult> {
      const { walletClient, account, accountAddress } = requireWallet(config);
      const { artifact } = params;

      if (artifact.tokens.length === 0) {
        throw new Error('Root artifact must contain at least one token');
      }

      const uniqueContracts = uniqueAddresses(artifact.tokens.map((token) => token.contract));

      for (const token of artifact.tokens.slice(0, 3)) {
        const owner = (await publicClient.readContract({
          address: token.contract,
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
          args: [BigInt(token.tokenId)],
        }));
        if (!isAddressEqual(owner, accountAddress)) {
          throw new Error(
            `Token ${token.contract}/${token.tokenId} is owned by ${owner}, not the configured account ${accountAddress}. ` +
              `Re-check the token set before registering this batch listing.`,
          );
        }
      }

      const approvalTxHashes = params.autoApprove === false
        ? []
        : await Promise.all(
          uniqueContracts.map(async (nftAddress): Promise<Hash | undefined> => {
            const isApproved = await publicClient.readContract({
              address: nftAddress,
              abi: approvalAbi,
              functionName: 'isApprovedForAll',
              args: [accountAddress, addresses.erc721ApprovalManager],
            });
            if (isApproved) return undefined;

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
            return approvalTxHash;
          }),
        ).then((hashes) => hashes.filter(isHash));

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
      return { txHash, receipt, approvalTxHashes: approvalTxHashes.length > 0 ? approvalTxHashes : undefined };
    },

    async cancel(params): Promise<TransactionResult> {
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

    async buy(params): Promise<TransactionResult> {
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

    async setAllowList(params): Promise<TransactionResult> {
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

    async getStatus(params): Promise<BatchListingStatus> {
      const listingConfig = (await publicClient.readContract({
        address: addresses.batchListing,
        abi: batchListingAbi,
        functionName: 'getMerkleSalePriceConfig',
        args: [params.creator, params.root],
      }));

      const cancellationNonce = (await publicClient.readContract({
        address: addresses.batchListing,
        abi: batchListingAbi,
        functionName: 'getCreatorSalePriceMerkleRootNonce',
        args: [params.creator, params.root],
      }));

      const hasListing =
        listingConfig.amount > 0n &&
        !isAddressEqual(listingConfig.currency, ETH_ADDRESS) &&
        cancellationNonce === listingConfig.nonce;
      const allowList = await readAllowListConfig(publicClient, addresses.batchListing, params.creator, params.root);
      const tokenStatus = await readTokenStatus(publicClient, addresses.batchListing, params);

      return {
        root: params.root,
        seller: params.creator,
        currencyAddress: listingConfig.currency,
        amount: listingConfig.amount,
        splitRecipients: [...listingConfig.splitRecipients],
        splitRatios: [...listingConfig.splitRatios],
        nonce: listingConfig.nonce,
        isEth: isAddressEqual(listingConfig.currency, ETH_ADDRESS),
        hasListing,
        allowList,
        ...tokenStatus,
      };
    },
  };
}

function isHash(value: Hash | undefined): value is Hash {
  return value !== undefined;
}

function uniqueAddresses(addresses: Address[]): Address[] {
  return addresses.reduce<Address[]>(
    (unique, address) => unique.some((existing) => isAddressEqual(existing, address)) ? unique : [...unique, address],
    [],
  );
}

async function readAllowListConfig(
  publicClient: PublicClient,
  batchListingAddress: Address,
  creator: Address,
  root: `0x${string}`,
): Promise<{ root: `0x${string}`; endTimestamp: bigint } | undefined> {
  try {
    const allowList = await publicClient.readContract({
      address: batchListingAddress,
      abi: batchListingAbi,
      functionName: 'getAllowListConfig',
      args: [creator, root],
    });
    return allowList.root === ZERO_BYTES32
      ? undefined
      : { root: allowList.root, endTimestamp: allowList.endTimestamp };
  } catch {
    // Contract may revert if no allowlist is set.
    return undefined;
  }
}

async function readTokenStatus(
  publicClient: PublicClient,
  batchListingAddress: Address,
  params: Parameters<RareClient['batchListing']['getStatus']>[0],
): Promise<Pick<BatchListingStatus, 'tokenInRoot' | 'tokenNonce'>> {
  if (params.contract === undefined || params.tokenId === undefined || params.proof === undefined) {
    return {};
  }

  const tokenId = toInteger(params.tokenId, 'tokenId');
  const [tokenInRoot, tokenNonce] = await Promise.all([
    publicClient.readContract({
      address: batchListingAddress,
      abi: batchListingAbi,
      functionName: 'isTokenInRoot',
      args: [params.root, params.contract, tokenId, params.proof],
    }),
    publicClient.readContract({
      address: batchListingAddress,
      abi: batchListingAbi,
      functionName: 'getTokenSalePriceNonce',
      args: [params.creator, params.root, params.contract, tokenId],
    }),
  ]);

  return { tokenInRoot, tokenNonce };
}
