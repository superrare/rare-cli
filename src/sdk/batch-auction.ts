import {
  isAddressEqual,
  parseEventLogs,
  type Address,
  type Hash,
  type Hex,
  type PublicClient,
} from 'viem';
import { batchAuctionHouseAbi } from '../contracts/abis/batch-auctionhouse.js';
import { ETH_ADDRESS, requireContractAddress, type SupportedChain } from '../contracts/addresses.js';
import {
  approvalAbi,
  preparePaymentAmountForSpender,
  requireWallet,
  waitForApproval,
} from './helpers.js';
import type { RareClient, RareClientConfig, WalletAccount } from './types.js';
import {
  planBatchAuctionBid,
  planBatchAuctionCreate,
  planBatchAuctionRoot,
  planBatchAuctionStatus,
  shapeBatchAuctionCurrentBidRead,
  shapeBatchAuctionDetailsRead,
  shapeBatchAuctionMerkleConfigRead,
  shapeBatchAuctionStatus,
  type BatchAuctionReadDetails,
  type BatchAuctionRootContext,
} from './batch-auction-core.js';

export function createBatchAuctionNamespace(
  publicClient: PublicClient,
  config: RareClientConfig,
  chain: SupportedChain,
): RareClient['batch']['auction'] {
  return {
    async create(params): ReturnType<RareClient['batch']['auction']['create']> {
      const batchAuctionHouse = requireContractAddress(chain, 'batchAuctionHouse');
      const { walletClient, account, accountAddress } = requireWallet(config);
      const plan = planBatchAuctionCreate(params, accountAddress);
      const erc721ApprovalManager = plan.approvalContracts.length === 0
        ? undefined
        : requireContractAddress(chain, 'erc721ApprovalManager');
      const approvalTxHashes = await approveNftContracts({
        publicClient,
        account,
        accountAddress,
        walletClient,
        operator: erc721ApprovalManager,
        nftAddresses: plan.approvalContracts,
      });

      const txHash = await walletClient.writeContract({
        address: batchAuctionHouse,
        abi: batchAuctionHouseAbi,
        functionName: 'registerAuctionMerkleRoot',
        args: [
          plan.root,
          plan.currency,
          plan.reserveAmount,
          plan.duration,
          plan.splitAddresses,
          plan.splitRatios,
        ],
        account,
        chain: undefined,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const logs = parseEventLogs({
        abi: batchAuctionHouseAbi,
        logs: receipt.logs,
        eventName: 'AuctionMerkleRootRegistered',
      });
      const [registered] = logs;

      if (!registered) {
        throw new Error('Batch auction create transaction succeeded but AuctionMerkleRootRegistered was not found in logs.');
      }

      return {
        txHash,
        receipt,
        batchAuctionHouse,
        creator: registered.args.creator,
        root: registered.args.merkleRoot,
        currency: registered.args.currencyAddress,
        reserveAmount: registered.args.startingAmount,
        duration: registered.args.duration,
        nonce: registered.args.nonce,
        approvalTxHashes,
      };
    },

    async cancel(params): ReturnType<RareClient['batch']['auction']['cancel']> {
      const batchAuctionHouse = requireContractAddress(chain, 'batchAuctionHouse');
      const { walletClient, account } = requireWallet(config);
      const plan = planBatchAuctionRoot(params);

      const txHash = await walletClient.writeContract({
        address: batchAuctionHouse,
        abi: batchAuctionHouseAbi,
        functionName: 'cancelAuctionMerkleRoot',
        args: [plan.root],
        account,
        chain: undefined,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const logs = parseEventLogs({
        abi: batchAuctionHouseAbi,
        logs: receipt.logs,
        eventName: 'AuctionMerkleRootCancelled',
      });
      const [cancelled] = logs;

      if (!cancelled) {
        throw new Error('Batch auction cancel transaction succeeded but AuctionMerkleRootCancelled was not found in logs.');
      }

      return {
        txHash,
        receipt,
        batchAuctionHouse,
        creator: cancelled.args.creator,
        root: cancelled.args.merkleRoot,
      };
    },

    async bid(params): ReturnType<RareClient['batch']['auction']['bid']> {
      const batchAuctionHouse = requireContractAddress(chain, 'batchAuctionHouse');
      const { walletClient, account, accountAddress } = requireWallet(config);
      const plan = planBatchAuctionBid(params);
      const erc20ApprovalManager = isAddressEqual(plan.currency, ETH_ADDRESS)
        ? batchAuctionHouse
        : requireContractAddress(chain, 'erc20ApprovalManager');
      const payment = await preparePaymentAmountForSpender({
        publicClient,
        walletClient,
        account,
        accountAddress,
        spenderAddress: erc20ApprovalManager,
        currency: plan.currency,
        requiredAmount: plan.requiredPayment,
        autoApprove: params.autoApprove,
      });

      const txHash = await walletClient.writeContract({
        address: batchAuctionHouse,
        abi: batchAuctionHouseAbi,
        functionName: 'bidWithAuctionMerkleProof',
        args: [
          plan.currency,
          plan.contract,
          plan.tokenId,
          plan.creator,
          plan.root,
          plan.amount,
          plan.proof,
        ],
        account,
        chain: undefined,
        value: payment.value,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const logs = parseEventLogs({
        abi: batchAuctionHouseAbi,
        logs: receipt.logs,
        eventName: 'AuctionMerkleBid',
      });
      const [bid] = logs;

      if (!bid) {
        throw new Error('Batch auction bid transaction succeeded but AuctionMerkleBid was not found in logs.');
      }

      return {
        txHash,
        receipt,
        batchAuctionHouse,
        bidder: bid.args.bidder,
        creator: bid.args.creator,
        contract: bid.args.contractAddress,
        tokenId: bid.args.tokenId,
        root: bid.args.merkleRoot,
        currency: bid.args.currencyAddress,
        amount: bid.args.amount,
        nonce: bid.args.nonce,
        requiredPayment: payment.requiredAmount,
        approvalTxHash: payment.approvalTxHash,
      };
    },

    async settle(params): ReturnType<RareClient['batch']['auction']['settle']> {
      const batchAuctionHouse = requireContractAddress(chain, 'batchAuctionHouse');
      const { walletClient, account } = requireWallet(config);
      const plan = planBatchAuctionStatus(params);

      const txHash = await walletClient.writeContract({
        address: batchAuctionHouse,
        abi: batchAuctionHouseAbi,
        functionName: 'settleAuction',
        args: [plan.contract, plan.tokenId],
        account,
        chain: undefined,
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });
      const logs = parseEventLogs({
        abi: batchAuctionHouseAbi,
        logs: receipt.logs,
        eventName: 'AuctionSettled',
      });
      const [settled] = logs;

      if (!settled) {
        throw new Error('Batch auction settle transaction succeeded but AuctionSettled was not found in logs.');
      }

      return {
        txHash,
        receipt,
        batchAuctionHouse,
        seller: settled.args.seller,
        bidder: settled.args.bidder,
        contract: settled.args.contractAddress,
        tokenId: settled.args.tokenId,
        currency: settled.args.currencyAddress,
        amount: settled.args.amount,
        marketplaceFee: settled.args.marketplaceFee,
      };
    },

    async getStatus(params): ReturnType<RareClient['batch']['auction']['getStatus']> {
      const batchAuctionHouse = requireContractAddress(chain, 'batchAuctionHouse');
      const plan = planBatchAuctionStatus(params);
      const [details, currentBid, block] = await Promise.all([
        publicClient.readContract({
          address: batchAuctionHouse,
          abi: batchAuctionHouseAbi,
          functionName: 'getAuctionDetails',
          args: [plan.contract, plan.tokenId],
        }),
        publicClient.readContract({
          address: batchAuctionHouse,
          abi: batchAuctionHouseAbi,
          functionName: 'getCurrentBid',
          args: [plan.contract, plan.tokenId],
        }),
        publicClient.getBlock(),
      ]);
      const shapedDetails = shapeBatchAuctionDetailsRead(details);
      const eventContext = await resolveEventContext({
        publicClient,
        batchAuctionHouse,
        planRoot: plan.root,
        planCreator: plan.creator,
        details: shapedDetails,
        contract: plan.contract,
        tokenId: plan.tokenId,
      });
      const rootContext = await resolveRootContext({
        publicClient,
        batchAuctionHouse,
        creator: eventContext.creator,
        root: eventContext.root,
        contract: plan.contract,
        tokenId: plan.tokenId,
      });

      return shapeBatchAuctionStatus(
        shapedDetails,
        shapeBatchAuctionCurrentBidRead(currentBid),
        rootContext,
        block.timestamp,
      );
    },
  };
}

async function approveNftContracts(opts: {
  publicClient: PublicClient;
  walletClient: RareClientConfig['walletClient'];
  account: Address | WalletAccount;
  accountAddress: Address;
  operator: Address | undefined;
  nftAddresses: readonly Address[];
}): Promise<Hash[]> {
  if (opts.walletClient === undefined) {
    throw new Error('walletClient is required for write operations.');
  }
  if (opts.nftAddresses.length > 0 && opts.operator === undefined) {
    throw new Error('RARE Protocol erc721ApprovalManager contract is required for batch auction NFT approvals.');
  }
  if (opts.operator === undefined) {
    return [];
  }

  return opts.nftAddresses.reduce<Promise<Hash[]>>(async (previous, nftAddress) => {
    const hashes = await previous;
    const txHash = await approveNftContract({
      publicClient: opts.publicClient,
      walletClient: opts.walletClient,
      account: opts.account,
      accountAddress: opts.accountAddress,
      operator: opts.operator,
      nftAddress,
    });
    return txHash === undefined ? hashes : [...hashes, txHash];
  }, Promise.resolve([]));
}

async function approveNftContract(opts: {
  publicClient: PublicClient;
  walletClient: NonNullable<RareClientConfig['walletClient']>;
  account: Address | WalletAccount;
  accountAddress: Address;
  operator: Address;
  nftAddress: Address;
}): Promise<Hash | undefined> {
  const isApproved = await opts.publicClient.readContract({
    address: opts.nftAddress,
    abi: approvalAbi,
    functionName: 'isApprovedForAll',
    args: [opts.accountAddress, opts.operator],
  });

  if (isApproved) {
    return undefined;
  }

  const txHash = await opts.walletClient.writeContract({
    address: opts.nftAddress,
    abi: approvalAbi,
    functionName: 'setApprovalForAll',
    args: [opts.operator, true],
    account: opts.account,
    chain: undefined,
  });
  await opts.publicClient.waitForTransactionReceipt({ hash: txHash });
  await waitForApproval(opts.publicClient, opts.nftAddress, opts.accountAddress, opts.operator);
  return txHash;
}

async function resolveEventContext(opts: {
  publicClient: PublicClient;
  batchAuctionHouse: Address;
  planRoot: Hex | undefined;
  planCreator: Address | undefined;
  details: BatchAuctionReadDetails;
  contract: Address;
  tokenId: bigint;
}): Promise<{ creator?: Address; root?: Hex }> {
  if (opts.planRoot !== undefined && opts.planCreator !== undefined) {
    return {
      creator: opts.planCreator,
      root: opts.planRoot,
    };
  }
  if (opts.details.creationBlock === 0n) {
    return {
      ...(opts.planCreator === undefined ? {} : { creator: opts.planCreator }),
      ...(opts.planRoot === undefined ? {} : { root: opts.planRoot }),
    };
  }

  const events = await opts.publicClient.getContractEvents({
    address: opts.batchAuctionHouse,
    abi: batchAuctionHouseAbi,
    eventName: 'AuctionMerkleBid',
    args: {
      contractAddress: opts.contract,
      tokenId: opts.tokenId,
    },
    fromBlock: opts.details.creationBlock,
    toBlock: opts.details.creationBlock,
    strict: true,
  });
  const [event] = events;

  return {
    creator: opts.planCreator ?? event?.args.creator,
    root: opts.planRoot ?? event?.args.merkleRoot,
  };
}

async function resolveRootContext(opts: {
  publicClient: PublicClient;
  batchAuctionHouse: Address;
  creator: Address | undefined;
  root: Hex | undefined;
  contract: Address;
  tokenId: bigint;
}): Promise<BatchAuctionRootContext | undefined> {
  if (opts.creator === undefined || opts.root === undefined) {
    return undefined;
  }

  const [config, rootNonce, tokenNonce] = await Promise.all([
    opts.publicClient.readContract({
      address: opts.batchAuctionHouse,
      abi: batchAuctionHouseAbi,
      functionName: 'getMerkleAuctionConfig',
      args: [opts.creator, opts.root],
    }),
    opts.publicClient.readContract({
      address: opts.batchAuctionHouse,
      abi: batchAuctionHouseAbi,
      functionName: 'getCreatorAuctionMerkleRootNonce',
      args: [opts.creator, opts.root],
    }),
    opts.publicClient.readContract({
      address: opts.batchAuctionHouse,
      abi: batchAuctionHouseAbi,
      functionName: 'getTokenAuctionNonce',
      args: [opts.creator, opts.root, opts.contract, opts.tokenId],
    }),
  ]);

  return {
    creator: opts.creator,
    root: opts.root,
    config: shapeBatchAuctionMerkleConfigRead(config),
    rootNonce,
    tokenNonce,
  };
}
