import { isAddressEqual, type Address, type Hash, type PublicClient, type WalletClient } from 'viem';
import { batchListingAbi } from '../contracts/abis/batch-listing.js';
import type { SupportedChain } from '../contracts/addresses.js';
import type {
  BatchListingCancelResult,
  BatchListingCreateResult,
  BatchListingProofArtifact,
  BatchListingRootArtifact,
  BatchListingSetAllowListResult,
  BatchListingStatus,
  IntegerInput,
  RareClient,
  RareClientConfig,
  TransactionResult,
  WalletAccount,
} from './types.js';
import {
  approveNftContractIfNeeded,
  calculateMarketplacePaymentAmountFromSettings,
  preparePaymentAmountForSpender,
  requireInput,
  requireWallet,
  toInteger,
  toCurrencyAmount,
  toUnixTimestamp,
} from './helpers.js';
import {
  generateApiAddressMerkleRoot,
  generateApiNftMerkleRoot,
  resolveApiAddressMerkleProof,
  resolveApiNftMerkleProof,
} from './merkle-api.js';
import {
  planBatchListingRootRegistration,
  shapeBatchListingStatus,
  shouldResolveBatchListingAllowListProof,
  uniqueAddresses,
} from './batch-listing-core.js';
import { normalizeBytes32 } from './batch-core.js';
import { resolveCurrencyForSdk } from './currency.js';

const ZERO_BYTES32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;

export function createBatchListingNamespace(
  publicClient: PublicClient,
  config: RareClientConfig,
  addresses: {
    batchListing: Address;
    marketplaceSettings: Address;
    erc20ApprovalManager: Address;
    erc721ApprovalManager: Address;
    chain: SupportedChain;
    chainId: number;
  },
): RareClient['listing']['batch'] {
  return {
    async create(params): Promise<BatchListingCreateResult> {
      const { walletClient, account, accountAddress } = requireWallet(config);
      const artifact = await resolveApiBatchListingRootArtifact(config, params.artifact);
      const splitConfig = planBatchListingRootRegistration(artifact, accountAddress);

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

      const approvalTxHashes = await Promise.all(
        uniqueContracts.map(async (nftAddress) => approveNftContractIfNeeded({
          publicClient,
          walletClient,
          account,
          accountAddress,
          nftAddress,
          operator: addresses.erc721ApprovalManager,
          autoApprove: params.autoApprove,
        })),
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
      return {
        txHash,
        receipt,
        root: artifact.root,
        approvalTxHashes: approvalTxHashes.length > 0 ? approvalTxHashes : undefined,
      };
    },

    async cancel(params): Promise<BatchListingCancelResult> {
      const { walletClient, account, accountAddress } = requireWallet(config);
      const root = await resolveBatchListingRoot({
        config,
        chainId: addresses.chainId,
        creator: accountAddress,
        params,
      });
      const txHash = await walletClient.writeContract({
        address: addresses.batchListing,
        abi: batchListingAbi,
        functionName: 'cancelSalePriceMerkleRoot',
        args: [root],
        account,
        chain: undefined,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt, root };
    },

    async buy(params): Promise<TransactionResult & { approvalTxHash?: Hash }> {
      const { walletClient, account, accountAddress } = requireWallet(config);
      const proofArtifact = await resolveBatchListingBuyProofArtifact({
        publicClient,
        config,
        batchListingAddress: addresses.batchListing,
        chainId: addresses.chainId,
        params,
        accountAddress,
      });

      if (proofArtifact.proof.length === 0) {
        throw new Error('Proof artifact proof must not be empty; the batch listing contract rejects empty token proofs');
      }

      const price = requireInput(params.price, 'price');
      const currency = resolveCurrencyForSdk(params.currency, addresses.chain).address;
      const amount = await toCurrencyAmount(publicClient, addresses.chain, currency, price, 'price');
      const tokenIdBig = toInteger(proofArtifact.tokenId, 'tokenId');
      const allowListProof = proofArtifact.allowListProof ?? [];

      const payment = await prepareBatchListingPayment({
        publicClient,
        walletClient,
        account,
        accountAddress,
        marketplaceSettings: addresses.marketplaceSettings,
        erc20ApprovalManager: addresses.erc20ApprovalManager,
        currency,
        amount,
        autoApprove: params.autoApprove,
      });

      const txHash = await walletClient.writeContract({
        address: addresses.batchListing,
        abi: batchListingAbi,
        functionName: 'buyWithMerkleProof',
        args: [
          proofArtifact.contract,
          tokenIdBig,
          currency,
          amount,
          params.creator,
          proofArtifact.root,
          proofArtifact.proof,
          allowListProof,
        ],
        account,
        chain: undefined,
        value: payment.value,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt, approvalTxHash: payment.approvalTxHash };
    },

    async setAllowlist(params): Promise<BatchListingSetAllowListResult> {
      const { walletClient, account, accountAddress } = requireWallet(config);
      const root = await resolveBatchListingRoot({
        config,
        chainId: addresses.chainId,
        creator: accountAddress,
        params,
      });
      const allowListRoot = await resolveBatchListingAllowListRoot(config, params);
      const endTime = toUnixTimestamp(
        requireInput(params.endTime ?? params.artifact?.allowList?.endTimestamp, 'endTime'),
        'endTime',
      );
      const txHash = await walletClient.writeContract({
        address: addresses.batchListing,
        abi: batchListingAbi,
        functionName: 'setAllowListConfig',
        args: [root, allowListRoot, endTime],
        account,
        chain: undefined,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      return { txHash, receipt, root, allowListRoot, endTime };
    },

    async status(params): Promise<BatchListingStatus> {
      const resolvedParams = await resolveBatchListingStatusParams({
        config,
        chainId: addresses.chainId,
        params,
      });
      const listingConfig = (await publicClient.readContract({
        address: addresses.batchListing,
        abi: batchListingAbi,
        functionName: 'getMerkleSalePriceConfig',
        args: [resolvedParams.creator, resolvedParams.root],
      }));

      const cancellationNonce = (await publicClient.readContract({
        address: addresses.batchListing,
        abi: batchListingAbi,
        functionName: 'getCreatorSalePriceMerkleRootNonce',
        args: [resolvedParams.creator, resolvedParams.root],
      }));

      const allowList = await readAllowListConfig(publicClient, addresses.batchListing, resolvedParams.creator, resolvedParams.root);
      const tokenStatus = await readTokenStatus(publicClient, addresses.batchListing, resolvedParams);

      return shapeBatchListingStatus({
        root: resolvedParams.root,
        creator: resolvedParams.creator,
        listingConfig,
        cancellationNonce,
        allowList,
        tokenStatus,
      });
    },
  };
}

async function resolveBatchListingRoot(opts: {
  config: RareClientConfig;
  chainId: number;
  creator: Address;
  params: {
    root?: `0x${string}`;
    artifact?: BatchListingRootArtifact;
    contract?: Address;
    tokenId?: IntegerInput;
  };
}): Promise<`0x${string}`> {
  const root = opts.params.root === undefined ? undefined : normalizeBytes32(opts.params.root, 'root');
  const artifactRoot = opts.params.artifact === undefined
    ? undefined
    : normalizeBytes32(opts.params.artifact.root, 'artifact root');

  if (root !== undefined && artifactRoot !== undefined && root !== artifactRoot) {
    throw new Error('root does not match artifact root.');
  }
  if (root !== undefined) {
    return root;
  }
  if (artifactRoot !== undefined) {
    return artifactRoot;
  }
  if (opts.params.contract === undefined || opts.params.tokenId === undefined) {
    throw new Error('Pass an artifact, or pass contract and tokenId so rare-api can resolve the batch listing root. Use root only as an override.');
  }

  const proof = await resolveApiNftMerkleProof(opts.config, {
    chainId: opts.chainId,
    contractAddress: opts.params.contract,
    tokenId: opts.params.tokenId,
    context: 'batch-listing',
    creator: opts.creator,
  });
  return proof.root;
}

async function resolveBatchListingAllowListRoot(
  config: RareClientConfig,
  params: {
    allowListRoot?: `0x${string}`;
    artifact?: BatchListingRootArtifact;
  },
): Promise<`0x${string}`> {
  if (params.allowListRoot !== undefined) {
    return normalizeBytes32(params.allowListRoot, 'allowListRoot');
  }

  const allowList = params.artifact?.allowList;
  if (allowList === undefined) {
    throw new Error('Pass an artifact with allowList addresses, or pass allowListRoot as an override.');
  }
  if (allowList.addresses.length < 2) {
    throw new Error(
      'Allowlist must contain at least two addresses; the batch listing contract rejects empty allowlist proofs',
    );
  }

  return generateApiAddressMerkleRoot(config, {
    addresses: allowList.addresses,
    storageTarget: 'batch-listing',
  });
}

async function resolveApiBatchListingRootArtifact(
  config: RareClientConfig,
  artifact: BatchListingRootArtifact,
): Promise<BatchListingRootArtifact> {
  const [root, allowListRoot] = await Promise.all([
    generateApiNftMerkleRoot(
      config,
      artifact.tokens.map((token) => ({
        contractAddress: token.contract,
        tokenId: token.tokenId,
      })),
    ),
    artifact.allowList === undefined
      ? Promise.resolve(undefined)
      : generateApiAddressMerkleRoot(config, {
          addresses: artifact.allowList.addresses,
          storageTarget: 'batch-listing',
        }),
  ]);

  return {
    ...artifact,
    root,
    ...(artifact.allowList === undefined
      ? {}
      : {
          allowList: {
            ...artifact.allowList,
            root: allowListRoot ?? artifact.allowList.root,
          },
        }),
  };
}

async function resolveBatchListingBuyProofArtifact(opts: {
  publicClient: PublicClient;
  config: RareClientConfig;
  batchListingAddress: Address;
  chainId: number;
  params: Parameters<RareClient['listing']['batch']['buy']>[0];
  accountAddress: Address;
}): Promise<BatchListingProofArtifact> {
  const tokenProof = opts.params.proofArtifact ?? await resolveBatchListingTokenProof(opts);
  const allowList = await readAllowListConfig(
    opts.publicClient,
    opts.batchListingAddress,
    opts.params.creator,
    tokenProof.root,
  );
  const block = allowList === undefined || tokenProof.allowListProof !== undefined
    ? undefined
    : await opts.publicClient.getBlock();
  const shouldResolveAllowListProof = shouldResolveBatchListingAllowListProof({
    allowList,
    tokenProof,
    nowTimestamp: block === undefined ? undefined : BigInt(block.timestamp),
  });

  if (!shouldResolveAllowListProof) {
    return tokenProof;
  }
  if (allowList === undefined) {
    throw new Error('unreachable: batch listing allowlist proof resolution requires allowlist config');
  }

  const allowListProof = await resolveApiAddressMerkleProof(opts.config, {
    root: allowList.root,
    address: opts.accountAddress,
    storageTarget: 'batch-listing',
  });

  return {
    ...tokenProof,
    allowListProof: allowListProof.proof,
    allowListAddress: allowListProof.address,
  };
}

async function resolveBatchListingTokenProof(opts: {
  config: RareClientConfig;
  chainId: number;
  params: Parameters<RareClient['listing']['batch']['buy']>[0];
}): Promise<BatchListingProofArtifact> {
  if (opts.params.contract === undefined || opts.params.tokenId === undefined) {
    throw new Error('Pass contract and tokenId so rare-api can resolve the batch listing proof, or pass a proofArtifact override.');
  }

  const proof = await resolveApiNftMerkleProof(opts.config, {
    chainId: opts.chainId,
    contractAddress: opts.params.contract,
    tokenId: opts.params.tokenId,
    root: opts.params.root,
    context: 'batch-listing',
    creator: opts.params.creator,
  });

  return {
    root: proof.root,
    contract: proof.contractAddress,
    tokenId: proof.tokenId,
    proof: proof.proof,
  };
}

type ResolvedBatchListingStatusParams =
  Parameters<RareClient['listing']['batch']['status']>[0] & {
    root: `0x${string}`;
  };

async function resolveBatchListingStatusParams(opts: {
  config: RareClientConfig;
  chainId: number;
  params: Parameters<RareClient['listing']['batch']['status']>[0];
}): Promise<ResolvedBatchListingStatusParams> {
  const { root } = opts.params;
  if (root !== undefined) {
    return { ...opts.params, root };
  }
  if (opts.params.contract === undefined || opts.params.tokenId === undefined) {
    throw new Error('Pass contract and tokenId so rare-api can resolve the batch listing root, or pass root as an override.');
  }

  const proof = await resolveApiNftMerkleProof(opts.config, {
    chainId: opts.chainId,
    contractAddress: opts.params.contract,
    tokenId: opts.params.tokenId,
    context: 'batch-listing',
    creator: opts.params.creator,
  });

  return {
    ...opts.params,
    root: proof.root,
    proof: opts.params.proof ?? proof.proof,
  };
}

function isHash(value: Hash | undefined): value is Hash {
  return value !== undefined;
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
  autoApprove?: boolean;
}): Promise<{ value: bigint; requiredAmount: bigint; approvalTxHash?: Hash }> {
  const requiredAmount = await calculateMarketplacePaymentAmountFromSettings(
    opts.publicClient,
    opts.marketplaceSettings,
    opts.amount,
  );

  return preparePaymentAmountForSpender({
    publicClient: opts.publicClient,
    walletClient: opts.walletClient,
    account: opts.account,
    accountAddress: opts.accountAddress,
    spenderAddress: opts.erc20ApprovalManager,
    currency: opts.currency,
    requiredAmount,
    autoApprove: opts.autoApprove,
  });
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
  params: ResolvedBatchListingStatusParams,
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
