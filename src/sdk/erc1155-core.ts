import { isAddressEqual, isHex, zeroAddress, type Address, type Hex } from 'viem';
import { ETH_ADDRESS } from '../contracts/addresses.js';
import { toNonNegativeInteger, toPositiveInteger } from './amounts-core.js';
import { planPayoutSplits, planProvidedPayoutSplits } from './splits-core.js';
import { toUnixTimestamp } from './validation-core.js';
import type {
  Erc1155CollectionCreateTokenParams,
  Erc1155CollectionMintBatchParams,
  Erc1155CollectionMintParams,
  Erc1155CollectionUpdateTokenUriParams,
  Erc1155CollectionSetMinterApprovalParams,
  Erc1155CollectionStatus,
  Erc1155CollectionStatusParams,
  Erc1155CheckoutDecodedFailure,
  Erc1155CheckoutExecution,
  Erc1155CheckoutFilledItem,
  Erc1155CheckoutItemInput,
  Erc1155CheckoutItemKind,
  Erc1155CheckoutPayment,
  Erc1155CheckoutResult,
  Erc1155CheckoutSkippedItem,
  Erc1155ListingBuyParams,
  Erc1155ListingCreateBatchItem,
  Erc1155ListingCreateBatchParams,
  Erc1155ListingCreateParams,
  Erc1155ListingStatus,
  Erc1155ListingStatusParams,
  Erc1155MintBatchItem,
  Erc1155OfferAcceptParams,
  Erc1155OfferCreateParams,
  Erc1155OfferStatus,
  Erc1155ReleaseConfigureBatchItem,
  Erc1155ReleaseConfigureBatchParams,
  Erc1155ReleaseCancelParams,
  Erc1155ReleaseAllowlistConfig,
  Erc1155ReleaseConfigureParams,
  Erc1155ReleaseLimitConfig,
  Erc1155ReleaseMintParams,
  Erc1155ReleaseSetAllowlistConfigParams,
  Erc1155ReleaseSetAllowlistConfigBatchParams,
  Erc1155ReleaseSetLimitBatchParams,
  Erc1155ReleaseSetLimitParams,
  Erc1155ReleaseStatus,
  Erc1155ReleaseStatusParams,
} from './types/erc1155.js';

export const zeroBytes32 = '0x0000000000000000000000000000000000000000000000000000000000000000' as const;
export const zeroBytes4 = '0x00000000' as const;
export const erc1155CheckoutItemKinds = {
  release: 0,
  listing: 1,
} as const;
export const erc1155CheckoutFailureStages = {
  none: 0,
  validation: 1,
  paymentCollection: 2,
  mint: 3,
  transfer: 4,
  payout: 5,
} as const;

export type Erc1155CollectionCreateTokenPlan = {
  contract: Address;
  tokenUri: string;
  maxSupply: bigint;
  royaltyReceiver?: Address;
}

export type Erc1155CollectionMintPlan = {
  contract: Address;
  tokenId: bigint;
  quantity: bigint;
  to?: Address;
}

export type Erc1155CollectionMintBatchPlan = {
  contract: Address;
  to?: Address;
  items: Erc1155MintBatchItem[];
}

export type Erc1155CollectionUpdateTokenUriPlan = {
  contract: Address;
  tokenId: bigint;
  tokenUri: string;
}

export type Erc1155ListingCreatePlan = {
  contract: Address;
  tokenId: bigint;
  quantity: bigint;
  currency: Address;
  price: bigint;
  expirationTime: bigint;
  splitAddresses: Address[];
  splitRatios: number[];
}

export type Erc1155ListingCreateBatchPlan = {
  contract: Address;
  currency: Address;
  items: Erc1155ListingCreateBatchItem[];
  splitAddresses: Address[];
  splitRatios: number[];
}

export type Erc1155ListingBuyPlan = {
  contract: Address;
  seller: Address;
  recipient: Address;
  tokenId: bigint;
  quantity: bigint;
  currency: Address;
  price: bigint;
  totalPrice: bigint;
}

export type Erc1155OfferCreatePlan = {
  contract: Address;
  tokenId: bigint;
  quantity: bigint;
  currency: Address;
  price: bigint;
  totalPrice: bigint;
  expirationTime: bigint;
}

export type Erc1155OfferAcceptPlan = {
  contract: Address;
  tokenId: bigint;
  buyer: Address;
  quantity: bigint;
  currency: Address;
  price: bigint;
  splitAddresses: Address[];
  splitRatios: number[];
}

export type Erc1155ReleaseConfigurePlan = {
  contract: Address;
  tokenId: bigint;
  currency: Address;
  price: bigint;
  startTime: bigint;
  maxMints: bigint;
  splitAddresses: Address[];
  splitRatios: number[];
}

export type Erc1155ReleaseConfigureBatchPlan = {
  contract: Address;
  currency: Address;
  items: Erc1155ReleaseConfigureBatchItem[];
  splitAddresses: Address[];
  splitRatios: number[];
}

export type Erc1155ReleaseCancelPlan = {
  contract: Address;
  tokenIds: bigint[];
}

export type Erc1155ReleaseMintPlan = {
  contract: Address;
  tokenId: bigint;
  quantity: bigint;
  recipient: Address;
  currency?: Address;
  price?: bigint;
  proof: Hex[];
}

export type Erc1155CheckoutInputPlanItem =
  | {
    kind: 'release';
    contract: Address;
    tokenId: bigint;
    quantity: bigint;
    priceInput?: Erc1155CheckoutItemInput['price'];
    currencyInput?: Erc1155CheckoutItemInput['currency'];
    proof: Hex[];
  }
  | {
    kind: 'listing';
    contract: Address;
    seller: Address;
    tokenId: bigint;
    quantity: bigint;
    priceInput: Erc1155ListingBuyParams['price'];
    currencyInput?: Erc1155CheckoutItemInput['currency'];
    proof: [];
  }

export type Erc1155CheckoutResolvedItem = {
  kind: 'release' | 'listing';
  itemKind: 0 | 1;
  contract: Address;
  seller: Address;
  currency: Address;
  tokenId: bigint;
  price: bigint;
  quantity: bigint;
  proof: Hex[];
  totalPrice: bigint;
}

export type Erc1155CheckoutPlan = {
  recipient: Address;
  items: Erc1155CheckoutResolvedItem[];
}

export type Erc1155CheckoutPaymentRequirement = {
  currencyAddress: Address;
  requiredAmount: bigint;
}

export function planErc1155CollectionCreateToken(
  params: Erc1155CollectionCreateTokenParams,
): Erc1155CollectionCreateTokenPlan {
  return {
    contract: params.contract,
    tokenUri: params.tokenUri ?? '',
    maxSupply: toPositiveInteger(params.maxSupply, 'maxSupply'),
    royaltyReceiver: params.royaltyReceiver,
  };
}

export function planErc1155CollectionMint(params: Erc1155CollectionMintParams): Erc1155CollectionMintPlan {
  return {
    contract: params.contract,
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    quantity: toPositiveInteger(params.quantity, 'quantity'),
    to: params.to,
  };
}

export function planErc1155CollectionMintBatch(params: Erc1155CollectionMintBatchParams): Erc1155CollectionMintBatchPlan {
  if (params.items.length === 0) {
    throw new Error('items must include at least one token.');
  }
  const items = params.items.map((item) => ({
    tokenId: toNonNegativeInteger(item.tokenId, 'tokenId'),
    quantity: toPositiveInteger(item.quantity, 'quantity'),
  }));
  assertStrictlyAscendingTokenIds(items);
  return {
    contract: params.contract,
    to: params.to,
    items,
  };
}

export function planErc1155CollectionSetMinterApproval(
  params: Erc1155CollectionSetMinterApprovalParams,
): Erc1155CollectionSetMinterApprovalParams {
  return params;
}

export function planErc1155CollectionUpdateTokenUri(
  params: Erc1155CollectionUpdateTokenUriParams,
): Erc1155CollectionUpdateTokenUriPlan {
  return {
    contract: params.contract,
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    tokenUri: params.tokenUri,
  };
}

export function planErc1155CollectionStatus(params: Erc1155CollectionStatusParams): {
  contract: Address;
  tokenId?: bigint;
  account?: Address;
} {
  return {
    contract: params.contract,
    tokenId: params.tokenId === undefined ? undefined : toNonNegativeInteger(params.tokenId, 'tokenId'),
    account: params.account,
  };
}

export function planErc1155ListingCreate(
  params: Omit<Erc1155ListingCreateParams, 'currency' | 'price'> & { currency: Address; price: bigint },
  accountAddress: Address,
): Erc1155ListingCreatePlan {
  const splits = planPayoutSplits(params.splitAddresses, params.splitRatios, accountAddress);
  return {
    contract: params.contract,
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    quantity: toPositiveInteger(params.quantity, 'quantity'),
    currency: params.currency,
    price: params.price,
    expirationTime: params.expirationTime === undefined ? 0n : toUnixTimestamp(params.expirationTime, 'expirationTime'),
    splitAddresses: splits.addresses,
    splitRatios: splits.ratios,
  };
}

export function planErc1155ListingCreateBatch(
  params: Omit<Erc1155ListingCreateBatchParams, 'currency' | 'items'> & {
    currency: Address;
    items: Array<Omit<Erc1155ListingCreateBatchParams['items'][number], 'price'> & { price: bigint }>;
  },
  accountAddress: Address,
): Erc1155ListingCreateBatchPlan {
  if (params.items.length === 0) {
    throw new Error('items must include at least one listing.');
  }
  const splits = planPayoutSplits(params.splitAddresses, params.splitRatios, accountAddress);
  const items = params.items.map((item, index) => ({
    tokenId: toNonNegativeInteger(item.tokenId, `items[${index}].tokenId`),
    quantity: toPositiveInteger(item.quantity, `items[${index}].quantity`),
    price: item.price,
    expirationTime: item.expirationTime === undefined
      ? 0n
      : toUnixTimestamp(item.expirationTime, `items[${index}].expirationTime`),
  }));
  assertStrictlyAscendingTokenIds(items);
  return {
    contract: params.contract,
    currency: params.currency,
    items,
    splitAddresses: splits.addresses,
    splitRatios: splits.ratios,
  };
}

export function planErc1155ListingCancel(params: { tokenIds: Erc1155ListingBuyParams['tokenId'][] }): bigint[] {
  if (params.tokenIds.length === 0) {
    throw new Error('tokenIds must include at least one token.');
  }
  const tokenIds = params.tokenIds.map((tokenId) => toNonNegativeInteger(tokenId, 'tokenId'));
  assertStrictlyAscendingTokenIds(tokenIds.map((tokenId) => ({ tokenId, quantity: 1n })));
  return tokenIds;
}

export function planErc1155ListingBuy(
  params: Omit<Erc1155ListingBuyParams, 'currency' | 'price'> & { currency: Address; price: bigint },
  accountAddress: Address,
): Erc1155ListingBuyPlan {
  const quantity = toPositiveInteger(params.quantity, 'quantity');
  const recipient = normalizeRecipient(params.recipient, accountAddress);
  return {
    contract: params.contract,
    seller: params.seller,
    recipient,
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    quantity,
    currency: params.currency,
    price: params.price,
    totalPrice: params.price * quantity,
  };
}

export function planErc1155ListingStatus(params: Erc1155ListingStatusParams): {
  contract: Address;
  seller: Address;
  tokenId: bigint;
} {
  return {
    contract: params.contract,
    seller: params.seller,
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
  };
}

export function planErc1155OfferCreate(
  params: Omit<Erc1155OfferCreateParams, 'currency' | 'price'> & { currency: Address; price: bigint },
): Erc1155OfferCreatePlan {
  const quantity = toPositiveInteger(params.quantity, 'quantity');
  return {
    contract: params.contract,
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    quantity,
    currency: params.currency,
    price: params.price,
    totalPrice: params.price * quantity,
    expirationTime: params.expirationTime === undefined ? 0n : toUnixTimestamp(params.expirationTime, 'expirationTime'),
  };
}

export function planErc1155OfferCancel(params: { tokenId: Erc1155OfferCreateParams['tokenId']; currency: Address }): {
  tokenId: bigint;
  currency: Address;
} {
  return {
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    currency: params.currency,
  };
}

export function planErc1155OfferAccept(
  params: Omit<Erc1155OfferAcceptParams, 'currency' | 'price'> & { currency: Address; price: bigint },
  accountAddress: Address,
): Erc1155OfferAcceptPlan {
  const splits = planPayoutSplits(params.splitAddresses, params.splitRatios, accountAddress);
  return {
    contract: params.contract,
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    buyer: params.buyer,
    quantity: toPositiveInteger(params.quantity, 'quantity'),
    currency: params.currency,
    price: params.price,
    splitAddresses: splits.addresses,
    splitRatios: splits.ratios,
  };
}

export function planErc1155ReleaseConfigure(
  params: Omit<Erc1155ReleaseConfigureParams, 'currency' | 'price'> & { currency: Address; price: bigint },
  accountAddress: Address,
  nowSeconds: bigint,
): Erc1155ReleaseConfigurePlan {
  const splits = planPayoutSplits(params.splitAddresses, params.splitRatios, accountAddress);
  return {
    contract: params.contract,
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    currency: params.currency,
    price: params.price,
    startTime: params.startTime === undefined ? nowSeconds : toUnixTimestamp(params.startTime, 'startTime'),
    maxMints: toNonNegativeInteger(params.maxMints, 'maxMints'),
    splitAddresses: splits.addresses,
    splitRatios: splits.ratios,
  };
}

export function planErc1155ReleaseConfigureBatch(
  params: Omit<Erc1155ReleaseConfigureBatchParams, 'currency' | 'items'> & {
    currency: Address;
    items: Array<Omit<Erc1155ReleaseConfigureBatchParams['items'][number], 'price'> & { price: bigint }>;
  },
  accountAddress: Address,
  nowSeconds: bigint,
): Erc1155ReleaseConfigureBatchPlan {
  if (params.items.length === 0) {
    throw new Error('items must include at least one release config.');
  }
  const splits = planPayoutSplits(params.splitAddresses, params.splitRatios, accountAddress);
  const items = params.items.map((item, index) => ({
    tokenId: toNonNegativeInteger(item.tokenId, `items[${index}].tokenId`),
    price: item.price,
    startTime: item.startTime === undefined ? nowSeconds : toUnixTimestamp(item.startTime, `items[${index}].startTime`),
    maxMints: toNonNegativeInteger(item.maxMints, `items[${index}].maxMints`),
  }));
  assertStrictlyAscendingTokenIds(items.map((item) => ({ tokenId: item.tokenId, quantity: 1n })));
  return {
    contract: params.contract,
    currency: params.currency,
    items,
    splitAddresses: splits.addresses,
    splitRatios: splits.ratios,
  };
}

export function planErc1155ReleaseCancel(params: Erc1155ReleaseCancelParams): Erc1155ReleaseCancelPlan {
  if (params.tokenIds.length === 0) {
    throw new Error('tokenIds must include at least one token.');
  }
  const tokenIds = params.tokenIds.map((tokenId) => toNonNegativeInteger(tokenId, 'tokenId'));
  assertStrictlyAscendingTokenIds(tokenIds.map((tokenId) => ({ tokenId, quantity: 1n })));
  return {
    contract: params.contract,
    tokenIds,
  };
}

export function planErc1155ReleaseMint(
  params: Omit<Erc1155ReleaseMintParams, 'currency' | 'price'> & { currency?: Address; price?: bigint },
  accountAddress: Address,
): Erc1155ReleaseMintPlan {
  const proof = [...(params.proof ?? [])];
  assertBytes32Proof(proof, 'proof');
  return {
    contract: params.contract,
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    quantity: toPositiveInteger(params.quantity, 'quantity'),
    recipient: normalizeRecipient(params.recipient, accountAddress),
    currency: params.currency,
    price: params.price,
    proof,
  };
}

export function planErc1155CheckoutInput(params: {
  items: Erc1155CheckoutItemInput[];
}): Erc1155CheckoutInputPlanItem[] {
  if (params.items.length === 0) {
    throw new Error('items must include at least one checkout item.');
  }

  return params.items.map((item, index) => {
    const tokenId = toNonNegativeInteger(item.tokenId, `items[${index}].tokenId`);
    const quantity = toPositiveInteger(item.quantity, `items[${index}].quantity`);
    if (item.kind === 'release') {
      const proof = [...(item.proof ?? [])];
      assertBytes32Proof(proof, `items[${index}].proof`);
      return {
        kind: 'release',
        contract: item.contract,
        tokenId,
        quantity,
        priceInput: item.price,
        currencyInput: item.currency,
        proof,
      };
    }
    return {
      kind: 'listing',
      contract: item.contract,
      seller: item.seller,
      tokenId,
      quantity,
      priceInput: item.price,
      currencyInput: item.currency,
      proof: [],
    };
  });
}

export function planErc1155CheckoutResolved(params: {
  recipient: Address;
  items: Array<{
    kind: 'release' | 'listing';
    contract: Address;
    seller?: Address;
    currency: Address;
    tokenId: bigint;
    price: bigint;
    quantity: bigint;
    proof?: readonly Hex[];
  }>;
}): Erc1155CheckoutPlan {
  if (params.items.length === 0) {
    throw new Error('items must include at least one checkout item.');
  }

  return {
    recipient: normalizeRecipient(params.recipient, params.recipient),
    items: params.items.map((item, index) => {
      if (item.kind === 'listing' && item.seller === undefined) {
        throw new Error(`items[${index}].seller is required for listing checkout items.`);
      }
      return {
        kind: item.kind,
        itemKind: item.kind === 'release' ? erc1155CheckoutItemKinds.release : erc1155CheckoutItemKinds.listing,
        contract: item.contract,
        seller: item.seller ?? zeroAddress,
        currency: item.currency,
        tokenId: item.tokenId,
        price: item.price,
        quantity: item.quantity,
        proof: [...(item.proof ?? [])],
        totalPrice: totalPrice(item.price, item.quantity),
      };
    }),
  };
}

export function groupErc1155CheckoutPayments(
  requirements: readonly Erc1155CheckoutPaymentRequirement[],
): Erc1155CheckoutPaymentRequirement[] {
  return requirements.reduce<Erc1155CheckoutPaymentRequirement[]>((groups, requirement) => {
    const index = groups.findIndex((group) => isAddressEqual(group.currencyAddress, requirement.currencyAddress));
    if (index === -1) {
      return [...groups, { ...requirement }];
    }
    return groups.map((group, groupIndex) => groupIndex === index
      ? { ...group, requiredAmount: group.requiredAmount + requirement.requiredAmount }
      : group);
  }, []);
}

export function planErc1155ReleaseAllowlistConfig(params: Erc1155ReleaseSetAllowlistConfigParams): {
  contract: Address;
  tokenId: bigint;
  root: Hex;
  endTimestamp: bigint;
} {
  const root = params.root ?? params.artifact?.root;
  if (root === undefined) {
    throw new Error('Pass root or artifact.');
  }
  assertBytes32(root, 'root');
  return {
    contract: params.contract,
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    root,
    endTimestamp: toUnixTimestamp(params.endTime, 'endTime'),
  };
}

export function planErc1155ReleaseAllowlistConfigBatch(params: Erc1155ReleaseSetAllowlistConfigBatchParams): Array<{
  contract: Address;
  tokenId: bigint;
  root: Hex;
  endTimestamp: bigint;
}> {
  if (params.items.length === 0) {
    throw new Error('items must include at least one allowlist config.');
  }
  const items = params.items.map((item, index) => {
    const root = item.root ?? item.artifact?.root;
    if (root === undefined) {
      throw new Error(`items[${index}].root or items[${index}].artifact is required.`);
    }
    assertBytes32(root, `items[${index}].root`);
    return {
      contract: params.contract,
      tokenId: toNonNegativeInteger(item.tokenId, `items[${index}].tokenId`),
      root,
      endTimestamp: toUnixTimestamp(item.endTime, `items[${index}].endTime`),
    };
  });
  assertStrictlyAscendingTokenIds(items.map((item) => ({ tokenId: item.tokenId, quantity: 1n })));
  return items;
}

export function planErc1155ReleaseClearAllowlistConfig(params: { contract: Address; tokenId: Erc1155ReleaseStatusParams['tokenId'] }): {
  contract: Address;
  tokenId: bigint;
  root: Hex;
  endTimestamp: bigint;
} {
  return {
    contract: params.contract,
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    root: zeroBytes32,
    endTimestamp: 0n,
  };
}

export function planErc1155ReleaseLimitConfig(params: Erc1155ReleaseSetLimitParams): {
  contract: Address;
  tokenId: bigint;
  limit: bigint;
} {
  return {
    contract: params.contract,
    tokenId: toNonNegativeInteger(params.tokenId, 'tokenId'),
    limit: toNonNegativeInteger(params.limit, 'limit'),
  };
}

export function planErc1155ReleaseLimitConfigBatch(params: Erc1155ReleaseSetLimitBatchParams): Array<{
  contract: Address;
  tokenId: bigint;
  limit: bigint;
}> {
  if (params.items.length === 0) {
    throw new Error('items must include at least one limit config.');
  }
  const items = params.items.map((item, index) => ({
    contract: params.contract,
    tokenId: toNonNegativeInteger(item.tokenId, `items[${index}].tokenId`),
    limit: toNonNegativeInteger(item.limit, `items[${index}].limit`),
  }));
  assertStrictlyAscendingTokenIds(items.map((item) => ({ tokenId: item.tokenId, quantity: 1n })));
  return items;
}

export function shapeErc1155CollectionStatus(params: {
  contract: Address;
  tokenId?: bigint;
  account?: Address;
  name?: string;
  symbol?: string;
  owner?: Address;
  disabled?: boolean;
  maxBatchSize?: bigint;
  approvedMinter?: boolean;
  uri?: string;
  maxSupply?: bigint;
  totalMinted?: bigint;
  balance?: bigint;
  royalty?: readonly [Address, bigint];
}): Erc1155CollectionStatus {
  return {
    contract: params.contract,
    name: params.name,
    symbol: params.symbol,
    owner: params.owner,
    disabled: params.disabled,
    maxBatchSize: params.maxBatchSize,
    account: params.account,
    accountApprovedMinter: params.approvedMinter,
    token: params.tokenId === undefined
      ? undefined
      : {
        tokenId: params.tokenId,
        uri: params.uri,
        maxSupply: params.maxSupply,
        totalMinted: params.totalMinted,
        accountBalance: params.balance,
        royalty: params.royalty === undefined
          ? undefined
          : {
            salePrice: 0n,
            receiver: params.royalty[0],
            amount: params.royalty[1],
          },
      },
  };
}

export function shapeErc1155ListingStatus(
  salePrice: readonly [Address, bigint, bigint, bigint, readonly Address[], readonly number[]],
  opts: {
    seller: Address;
    wallet?: Address | null;
    nowSeconds: bigint;
  },
): Erc1155ListingStatus {
  const [currencyAddress, price, quantity, expirationTime, splitAddresses, splitRatios] = salePrice;
  const hasListing = price > 0n && quantity > 0n;
  const expired = expirationTime > 0n && opts.nowSeconds > expirationTime;
  const wallet = opts.wallet ?? null;
  return {
    seller: opts.seller,
    currencyAddress,
    price,
    quantity,
    expirationTime,
    hasListing,
    isEth: isAddressEqual(currencyAddress, ETH_ADDRESS),
    expired,
    splitAddresses: [...splitAddresses],
    splitRatios: [...splitRatios],
    canBuy: wallet === null ? null : hasListing && !expired && !isAddressEqual(wallet, opts.seller),
  };
}

export function shapeErc1155OfferStatus(
  offer: readonly [Address, bigint, bigint, bigint, bigint],
  opts: {
    buyer: Address;
    wallet?: Address | null;
    nowSeconds: bigint;
  },
): Erc1155OfferStatus {
  const [currencyAddress, price, quantity, marketplaceFeeRemaining, expirationTime] = offer;
  const hasOffer = price > 0n && quantity > 0n;
  const expired = expirationTime > 0n && opts.nowSeconds > expirationTime;
  const wallet = opts.wallet ?? null;
  return {
    buyer: opts.buyer,
    currencyAddress,
    price,
    quantity,
    marketplaceFeeRemaining,
    expirationTime,
    hasOffer,
    isEth: isAddressEqual(currencyAddress, ETH_ADDRESS),
    expired,
    canAccept: wallet === null ? null : hasOffer && !expired && !isAddressEqual(wallet, opts.buyer),
    canCancel: wallet === null ? null : hasOffer && isAddressEqual(wallet, opts.buyer),
  };
}

export function shapeErc1155ReleaseAllowlistConfig(
  raw: readonly [Hex, bigint],
  opts: { marketplace: Address; contract: Address; tokenId: bigint; nowSeconds: bigint },
): Erc1155ReleaseAllowlistConfig {
  const [root, endTimestamp] = raw;
  return {
    marketplace: opts.marketplace,
    contract: opts.contract,
    tokenId: opts.tokenId,
    root,
    endTimestamp,
    active: root !== zeroBytes32 && endTimestamp >= opts.nowSeconds,
    now: opts.nowSeconds,
  };
}

export function shapeErc1155ReleaseLimitConfig(
  limit: bigint,
  opts: { marketplace: Address; contract: Address; tokenId: bigint },
): Erc1155ReleaseLimitConfig {
  return {
    marketplace: opts.marketplace,
    contract: opts.contract,
    tokenId: opts.tokenId,
    limit,
    enabled: limit > 0n,
  };
}

export function shapeErc1155ReleaseStatus(params: {
  marketplace: Address;
  contract: Address;
  tokenId: bigint;
  config: readonly [Address, Address, bigint, bigint, bigint, readonly Address[], readonly number[]];
  allowlist: readonly [Hex, bigint];
  mintLimit: bigint;
  txLimit: bigint;
  account?: Address | null;
  accountMints?: bigint | null;
  accountTxs?: bigint | null;
  maxSupply?: bigint | null;
  totalMinted?: bigint | null;
  nowSeconds: bigint;
}): Erc1155ReleaseStatus {
  const [seller, currencyAddress, price, startTime, maxMints, splitRecipients, splitRatios] = params.config;
  const [allowlistRoot, allowlistEndTimestamp] = params.allowlist;
  const configured = !isAddressEqual(seller, zeroAddress);
  const allowlistActive = allowlistRoot !== zeroBytes32 && allowlistEndTimestamp >= params.nowSeconds;
  const started = configured && startTime > 0n && params.nowSeconds >= startTime;
  const remainingSupply =
    params.maxSupply === null || params.maxSupply === undefined ||
    params.totalMinted === null || params.totalMinted === undefined
      ? null
      : params.maxSupply > params.totalMinted
        ? params.maxSupply - params.totalMinted
        : 0n;
  const soldOut = remainingSupply === null ? null : remainingSupply === 0n;
  const mintLimitReached = params.accountMints !== null && params.accountMints !== undefined && params.mintLimit > 0n && params.accountMints >= params.mintLimit;
  const txLimitReached = params.accountTxs !== null && params.accountTxs !== undefined && params.txLimit > 0n && params.accountTxs >= params.txLimit;
  return {
    marketplace: params.marketplace,
    contract: params.contract,
    tokenId: params.tokenId,
    configured,
    seller,
    currencyAddress,
    price,
    startTime,
    maxMints,
    splitRecipients: [...splitRecipients],
    splitRatios: [...splitRatios],
    allowlistRoot,
    allowlistEndTimestamp,
    allowlistActive,
    requiresAllowlist: allowlistRoot !== zeroBytes32,
    mintLimit: params.mintLimit,
    txLimit: params.txLimit,
    account: params.account ?? null,
    accountMints: params.accountMints ?? null,
    accountTxs: params.accountTxs ?? null,
    maxSupply: params.maxSupply ?? null,
    totalMinted: params.totalMinted ?? null,
    remainingSupply,
    soldOut,
    started,
    currentlyMintable: configured && started && soldOut !== true && !mintLimitReached && !txLimitReached,
    isEth: isAddressEqual(currencyAddress, ETH_ADDRESS),
    now: params.nowSeconds,
  };
}

export function shapeErc1155CheckoutResult(params: {
  marketplace: Address;
  txHash: Hex;
  receipt: Erc1155CheckoutResult['receipt'];
  completed?: {
    payer: Address;
    recipient: Address;
    filledCount: bigint;
    skippedCount: bigint;
    ethSpent: bigint;
    ethRefunded: bigint;
  };
  items: Erc1155CheckoutProcessedItemInput[];
  payments: readonly Erc1155CheckoutPayment[];
}): Erc1155CheckoutResult {
  const execution = shapeErc1155CheckoutExecution({
    marketplace: params.marketplace,
    completed: params.completed,
    items: params.items,
  });

  return {
    txHash: params.txHash,
    receipt: params.receipt,
    marketplace: params.marketplace,
    summary: execution.summary,
    items: execution.items,
    payments: params.payments.map((payment) => ({ ...payment })),
    approvalTxHashes: params.payments
      .map((payment) => payment.approvalTxHash)
      .filter((hash): hash is Hex => hash !== undefined),
  };
}

export type Erc1155CheckoutProcessedItemInput = {
  itemIndex: bigint;
  itemKind: number;
  contractAddress: Address;
  tokenId: bigint;
  seller: Address;
  currencyAddress: Address;
  price: bigint;
  quantity: bigint;
  filled: boolean;
  failureStage: number;
  reason: Hex;
  failureData: Hex;
  totalPaid: bigint;
  decodedFailure?: Erc1155CheckoutDecodedFailure;
}

export type Erc1155CheckoutExpectedLogItem = {
  itemKind: number;
  contractAddress: Address;
  seller: Address;
  currencyAddress: Address;
  tokenId: bigint;
  price: bigint;
  quantity: bigint;
}

export type Erc1155CheckoutCompletedLogInput = {
  payer: Address;
  recipient: Address;
  filledCount: bigint;
  skippedCount: bigint;
  ethSpent: bigint;
  ethRefunded: bigint;
}

export function shapeErc1155CheckoutExecution(params: {
  marketplace: Address;
  completed?: {
    payer?: Address | null;
    recipient?: Address | null;
    filledCount: bigint;
    skippedCount: bigint;
    ethSpent: bigint;
    ethRefunded: bigint;
  };
  items: Erc1155CheckoutProcessedItemInput[];
}): Erc1155CheckoutExecution {
  const items = params.items.map((item): Erc1155CheckoutFilledItem | Erc1155CheckoutSkippedItem => {
    const base = {
      index: Number(item.itemIndex),
      kind: checkoutKindName(item.itemKind),
      itemKind: item.itemKind,
      contract: item.contractAddress,
      tokenId: item.tokenId,
      seller: item.seller,
      currencyAddress: item.currencyAddress,
      price: item.price,
      quantity: item.quantity,
      failureStage: item.failureStage,
      failureStageName: checkoutFailureStageName(item.failureStage),
      reason: item.reason,
      failureData: item.failureData,
      totalPaid: item.totalPaid,
    };
    if (item.filled) {
      return {
        ...base,
        status: 'filled',
        filled: true,
      };
    }
    return {
      ...base,
      status: 'skipped',
      filled: false,
      decodedFailure: item.decodedFailure,
    };
  }).sort((left, right) => left.index - right.index);
  const filledCount = params.completed?.filledCount ?? BigInt(items.filter((item) => item.filled).length);
  const skippedCount = params.completed?.skippedCount ?? BigInt(items.filter((item) => !item.filled).length);
  return {
    marketplace: params.marketplace,
    summary: {
      payer: params.completed?.payer ?? null,
      recipient: params.completed?.recipient ?? null,
      filledCount,
      skippedCount,
      ethSpent: params.completed?.ethSpent ?? 0n,
      ethRefunded: params.completed?.ethRefunded ?? 0n,
    },
    items,
  };
}

export function validateErc1155CheckoutLogs(params: {
  txHash: Hex;
  expectedItems: readonly Erc1155CheckoutExpectedLogItem[];
  completedLogs: readonly Erc1155CheckoutCompletedLogInput[];
  processedItems: readonly Erc1155CheckoutProcessedItemInput[];
  ethValue: bigint;
}): {
  completed: Erc1155CheckoutCompletedLogInput;
  items: Erc1155CheckoutProcessedItemInput[];
} {
  if (params.completedLogs.length !== 1) {
    throw new Error(
      `ERC1155 checkout transaction ${params.txHash} emitted ${params.completedLogs.length.toString()} CheckoutCompleted logs; expected 1.`,
    );
  }
  const completed = params.completedLogs[0];
  if (completed === undefined) {
    throw new Error(`ERC1155 checkout transaction ${params.txHash} did not emit CheckoutCompleted.`);
  }
  if (params.processedItems.length !== params.expectedItems.length) {
    throw new Error(
      `ERC1155 checkout transaction ${params.txHash} emitted ${params.processedItems.length.toString()} ` +
        `CheckoutItemProcessed logs for ${params.expectedItems.length.toString()} input items.`,
    );
  }

  const sortedItems = params.processedItems.reduce<{
    seenIndexes: readonly number[];
    items: Erc1155CheckoutProcessedItemInput[];
  }>((state, item) => {
    const index = checkoutLogIndex(item, params.expectedItems.length, params.txHash);
    if (state.seenIndexes.includes(index)) {
      throw new Error(`ERC1155 checkout transaction ${params.txHash} emitted duplicate CheckoutItemProcessed index ${index.toString()}.`);
    }
    validateCheckoutLogItem(params.txHash, index, params.expectedItems[index], item);
    return {
      seenIndexes: [...state.seenIndexes, index],
      items: [...state.items, item],
    };
  }, { seenIndexes: [], items: [] }).items
    .toSorted((left, right) => Number(left.itemIndex) - Number(right.itemIndex));

  const filledCount = BigInt(sortedItems.filter((item) => item.filled).length);
  const skippedCount = BigInt(sortedItems.length) - filledCount;
  if (completed.filledCount !== filledCount || completed.skippedCount !== skippedCount) {
    throw new Error(
      `ERC1155 checkout transaction ${params.txHash} summary counts do not match item logs: ` +
        `summary filled=${completed.filledCount.toString()} skipped=${completed.skippedCount.toString()}, ` +
        `items filled=${filledCount.toString()} skipped=${skippedCount.toString()}.`,
    );
  }
  if (completed.filledCount + completed.skippedCount !== BigInt(params.expectedItems.length)) {
    throw new Error(`ERC1155 checkout transaction ${params.txHash} summary count total does not match input item count.`);
  }
  const loggedEthSpent = sortedItems
    .filter((item) => item.filled && isAddressEqual(item.currencyAddress, ETH_ADDRESS))
    .reduce((sum, item) => sum + item.totalPaid, 0n);
  if (completed.ethSpent !== loggedEthSpent) {
    throw new Error(
      `ERC1155 checkout transaction ${params.txHash} ethSpent ${completed.ethSpent.toString()} ` +
        `does not match filled ETH item totalPaid ${loggedEthSpent.toString()}.`,
    );
  }
  if (completed.ethSpent + completed.ethRefunded > params.ethValue) {
    throw new Error(
      `ERC1155 checkout transaction ${params.txHash} reports ethSpent + ethRefunded above submitted ETH value.`,
    );
  }

  return { completed, items: sortedItems };
}

function checkoutLogIndex(
  item: Erc1155CheckoutProcessedItemInput,
  expectedLength: number,
  txHash: Hex,
): number {
  if (item.itemIndex > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error(`ERC1155 checkout transaction ${txHash} emitted unsafe CheckoutItemProcessed index ${item.itemIndex.toString()}.`);
  }
  const index = Number(item.itemIndex);
  if (index < 0 || index >= expectedLength) {
    throw new Error(
      `ERC1155 checkout transaction ${txHash} emitted CheckoutItemProcessed index ${index.toString()} ` +
        `outside input item range 0-${Math.max(0, expectedLength - 1).toString()}.`,
    );
  }
  return index;
}

function validateCheckoutLogItem(
  txHash: Hex,
  index: number,
  expected: Erc1155CheckoutExpectedLogItem | undefined,
  actual: Erc1155CheckoutProcessedItemInput,
): void {
  if (expected === undefined) {
    throw new Error(`ERC1155 checkout transaction ${txHash} emitted unexpected CheckoutItemProcessed index ${index.toString()}.`);
  }

  assertCheckoutLogField(txHash, index, 'itemKind', actual.itemKind, expected.itemKind);
  assertCheckoutLogAddress(txHash, index, 'contractAddress', actual.contractAddress, expected.contractAddress);
  assertCheckoutLogAddress(txHash, index, 'seller', actual.seller, expected.seller);
  assertCheckoutLogAddress(txHash, index, 'currencyAddress', actual.currencyAddress, expected.currencyAddress);
  assertCheckoutLogField(txHash, index, 'tokenId', actual.tokenId, expected.tokenId);
  assertCheckoutLogField(txHash, index, 'price', actual.price, expected.price);
  assertCheckoutLogField(txHash, index, 'quantity', actual.quantity, expected.quantity);

  if (actual.filled) {
    if (actual.failureStage !== erc1155CheckoutFailureStages.none || actual.reason !== zeroBytes4 || actual.failureData !== '0x') {
      throw new Error(`ERC1155 checkout transaction ${txHash} filled item ${index.toString()} has non-empty failure data.`);
    }
    return;
  }

  if (actual.failureStage === erc1155CheckoutFailureStages.none) {
    throw new Error(`ERC1155 checkout transaction ${txHash} skipped item ${index.toString()} has failureStage NONE.`);
  }
  if (actual.failureData === '0x') {
    if (actual.reason !== zeroBytes4) {
      throw new Error(`ERC1155 checkout transaction ${txHash} skipped item ${index.toString()} has empty failureData but non-empty reason.`);
    }
    return;
  }
  if (actual.failureData.length >= 10 && actual.reason.toLowerCase() !== actual.failureData.slice(0, 10).toLowerCase()) {
    throw new Error(`ERC1155 checkout transaction ${txHash} skipped item ${index.toString()} reason does not match failureData selector.`);
  }
}

function assertCheckoutLogField(
  txHash: Hex,
  index: number,
  field: string,
  actual: number | bigint,
  expected: number | bigint,
): void {
  if (actual !== expected) {
    throw new Error(
      `ERC1155 checkout transaction ${txHash} item log ${index.toString()} field ${field} ` +
        `does not match checkout input: expected ${expected.toString()}, got ${actual.toString()}.`,
    );
  }
}

function assertCheckoutLogAddress(
  txHash: Hex,
  index: number,
  field: string,
  actual: Address,
  expected: Address,
): void {
  if (!isAddressEqual(actual, expected)) {
    throw new Error(
      `ERC1155 checkout transaction ${txHash} item log ${index.toString()} field ${field} ` +
        `does not match checkout input: expected ${expected}, got ${actual}.`,
    );
  }
}

export function totalPrice(price: bigint, quantity: bigint): bigint {
  return price * quantity;
}

export function providedSplits(splitAddresses: Address[], splitRatios: number[]): { addresses: Address[]; ratios: number[] } {
  return planProvidedPayoutSplits(splitAddresses, splitRatios);
}

function assertStrictlyAscendingTokenIds(items: readonly Erc1155MintBatchItem[]): void {
  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1];
    const current = items[index];
    if (previous !== undefined && current !== undefined && current.tokenId <= previous.tokenId) {
      throw new Error('tokenIds must be strictly ascending.');
    }
  }
}

function checkoutKindName(itemKind: number): Erc1155CheckoutItemKind {
  if (itemKind === erc1155CheckoutItemKinds.release) return 'release';
  if (itemKind === erc1155CheckoutItemKinds.listing) return 'listing';
  return 'unknown';
}

function checkoutFailureStageName(stage: number): Erc1155CheckoutFilledItem['failureStageName'] {
  if (stage === erc1155CheckoutFailureStages.none) return 'NONE';
  if (stage === erc1155CheckoutFailureStages.validation) return 'VALIDATION';
  if (stage === erc1155CheckoutFailureStages.paymentCollection) return 'PAYMENT_COLLECTION';
  if (stage === erc1155CheckoutFailureStages.mint) return 'MINT';
  if (stage === erc1155CheckoutFailureStages.transfer) return 'TRANSFER';
  if (stage === erc1155CheckoutFailureStages.payout) return 'PAYOUT';
  return 'UNKNOWN';
}

function assertBytes32Proof(proof: readonly Hex[], label: string): void {
  proof.forEach((entry, index) => {
    assertBytes32(entry, `${label}[${index}]`);
  });
}

function assertBytes32(value: Hex, label: string): void {
  if (!isHex(value) || value.length !== 66) {
    throw new Error(`${label} must be a bytes32 hex string.`);
  }
}

function normalizeRecipient(recipient: Address | undefined, accountAddress: Address): Address {
  const normalized = recipient ?? accountAddress;
  if (isAddressEqual(normalized, zeroAddress)) {
    throw new Error('recipient cannot be the zero address.');
  }
  return normalized;
}
