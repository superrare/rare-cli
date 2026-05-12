import { isAddressEqual, type Address, type Hash, type PublicClient, type WalletClient } from 'viem';
import { batchListingAbi } from '../contracts/abis/batch-listing.js';
import { ETH_ADDRESS } from '../contracts/addresses.js';
import type {
  BatchListingCreateResult,
  BatchListingRootArtifact,
  BatchListingStatus,
  RareClient,
  RareClientConfig,
  TransactionResult,
  WalletAccount,
} from './types.js';
import {
  approvalAbi,
  ensureTokenAllowance,
  marketplaceSettingsAbi,
  requireWallet,
  toInteger,
  toTokenAmount,
  waitForApproval,
} from './helpers.js';
import { planSplits } from './marketplace-core.js';

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

export function createBatchListingNamespace(
  publicClient: PublicClient,
  config: RareClientConfig,
  addresses: {
    batchListing: Address;
    marketplaceSettings: Address;
    erc20ApprovalManager: Address;
    erc721ApprovalManager: Address;
  },
): RareClient['batchListing'] {
  return {
    async create(params): Promise<BatchListingCreateResult> {
      const { walletClient, account, accountAddress } = requireWallet(config);
      const { artifact } = params;
      const splitConfig = prepareRootRegistrationConfig(artifact, accountAddress);

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
          splitConfig.splitAddresses,
          splitConfig.splitRatios,
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

      if (params.proofArtifact.proof.length === 0) {
        throw new Error('Proof artifact proof must not be empty; the batch listing contract rejects empty token proofs');
      }

      const amount = await toTokenAmount(publicClient, params.currency, params.amount, 'amount');
      const tokenIdBig = toInteger(params.proofArtifact.tokenId, 'tokenId');
      const allowListProof = params.proofArtifact.allowListProof ?? [];

      const value = await prepareBatchListingPayment({
        publicClient,
        walletClient,
        account,
        accountAddress,
        marketplaceSettings: addresses.marketplaceSettings,
        erc20ApprovalManager: addresses.erc20ApprovalManager,
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

function prepareRootRegistrationConfig(
  artifact: BatchListingRootArtifact,
  accountAddress: Address,
): { splitAddresses: Address[]; splitRatios: number[] } {
  if (artifact.tokens.length < 2) {
    throw new Error('Root artifact must contain at least two tokens; the batch listing contract rejects empty proofs');
  }

  if (artifact.allowList !== undefined && artifact.allowList.addresses.length < 2) {
    throw new Error(
      'Allowlist must contain at least two addresses; the batch listing contract rejects empty allowlist proofs',
    );
  }

  const { splitAddresses, splitRatios } = artifact;
  if (splitAddresses.length === 0 && splitRatios.length === 0) {
    const splits = planSplits(undefined, undefined, accountAddress);
    return { splitAddresses: splits.addresses, splitRatios: splits.ratios };
  }

  const splits = planSplits(splitAddresses, splitRatios, accountAddress);
  return { splitAddresses: splits.addresses, splitRatios: splits.ratios };
}

async function prepareBatchListingPayment(opts: {
  publicClient: PublicClient;
  walletClient: WalletClient;
  account: Address | WalletAccount;
  accountAddress: Address;
  marketplaceSettings: Address;
  erc20ApprovalManager: Address;
  currency: Address;
  amount: bigint;
}): Promise<bigint> {
  const fee = await opts.publicClient.readContract({
    address: opts.marketplaceSettings,
    abi: marketplaceSettingsAbi,
    functionName: 'calculateMarketplaceFee',
    args: [opts.amount],
  });
  const requiredAmount = opts.amount + fee;

  if (isAddressEqual(opts.currency, ETH_ADDRESS)) {
    return requiredAmount;
  }

  await ensureTokenAllowance(
    opts.publicClient,
    opts.walletClient,
    opts.account,
    opts.accountAddress,
    opts.currency,
    opts.erc20ApprovalManager,
    requiredAmount,
  );
  return 0n;
}

async function readAllowListConfig(
  publicClient: PublicClient,
  batchListingAddress: Address,
  creator: Address,
  root: `0x${string}`,
): Promise<{ root: `0x${string}`; endTimestamp: bigint } | undefined> {
  const allowList = await publicClient.readContract({
    address: batchListingAddress,
    abi: batchListingAbi,
    functionName: 'getAllowListConfig',
    args: [creator, root],
  });
  return allowList.root === ZERO_BYTES32
    ? undefined
    : { root: allowList.root, endTimestamp: allowList.endTimestamp };
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
