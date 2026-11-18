import { expect } from 'vitest';
import { getContractAddresses } from '@rareprotocol/rare-sdk/contracts';
import type { RareClient } from '@rareprotocol/rare-sdk';
import { erc20Abi, erc721Abi, getAddress, isAddressEqual, parseAbi, zeroAddress, type Address, type Hex } from 'viem';
import type { BuyerLiveFixture } from './live-harness.js';

/** Snapshot only leased wallets; shared treasury balances can change during other tests. */
export async function readPurchaseBalances(fixture: BuyerLiveFixture, currency: Address): Promise<{ buyer: bigint; seller: bigint }> {
  const balance = (address: Address): Promise<bigint> => isAddressEqual(currency, zeroAddress)
    ? fixture.publicClient.getBalance({ address })
    : fixture.publicClient.readContract({ address: currency, abi: erc20Abi, functionName: 'balanceOf', args: [address] });
  const [buyer, seller] = await Promise.all([balance(fixture.buyerAddress), balance(fixture.sellerAddress)]);
  return { buyer, seller };
}

/** Call immediately after purchase, before another transaction from either leased wallet. */
export async function verifyPurchaseBalances(fixture: BuyerLiveFixture, input: {
  transactionHash: Hex; currency: Address; before: { buyer: bigint; seller: bigint };
  buyerPayment: bigint; sellerProceeds: bigint;
}): Promise<void> {
  const receipt = await fixture.publicClient.getTransactionReceipt({ hash: input.transactionHash });
  expect(receipt.status).toBe('success');
  expect(receipt.from.toLowerCase()).toBe(fixture.buyerAddress.toLowerCase());
  const after = await readPurchaseBalances(fixture, input.currency);
  const gasCost = isAddressEqual(input.currency, zeroAddress) ? receipt.gasUsed * receipt.effectiveGasPrice : 0n;
  expect(input.before.buyer - after.buyer, `Buyer spend for ${input.transactionHash}`).toBe(input.buyerPayment + gasCost);
  expect(after.seller - input.before.seller, `Seller proceeds for ${input.transactionHash}`).toBe(input.sellerProceeds);
}

/** Verify chain ownership and both public detail/search views with bounded indexing time. */
export async function verifyErc721Ownership(fixture: BuyerLiveFixture, rare: RareClient, input: {
  transactionHash: Hex; contract: Address; tokenId: string;
}): Promise<void> {
  const identity = `${fixture.chainId}-${input.contract.toLowerCase()}-${input.tokenId}`;
  expect(await fixture.publicClient.readContract({ address: input.contract, abi: erc721Abi,
    functionName: 'ownerOf', args: [BigInt(input.tokenId)] })).toBe(getAddress(fixture.buyerAddress));
  await expect.poll(async () => {
    const [detail, search] = await Promise.all([
      rare.nft.get({ contract: input.contract, tokenId: input.tokenId }),
      rare.search.nfts({ contractAddress: input.contract, ownerAddress: fixture.buyerAddress, perPage: 100, page: 1 }),
    ]);
    const match = search.data.find(nft => nft.universalTokenId === identity);
    return { detailId: detail.universalTokenId, detailOwner: detail.owner.address.toLowerCase(),
      searchId: match?.universalTokenId, searchOwner: match?.owner.address.toLowerCase() };
  }, { timeout: 180_000, interval: 2_000,
    message: `NFT detail/search ownership for ${identity} after ${input.transactionHash}` }).toEqual({
    detailId: identity, detailOwner: fixture.buyerAddress.toLowerCase(),
    searchId: identity, searchOwner: fixture.buyerAddress.toLowerCase(),
  });
}

/** RareMinter deducts the primary-sale commission before applying seller splits. */
export async function readPrimarySaleProceeds(fixture: BuyerLiveFixture, contract: Address, amount: bigint): Promise<bigint> {
  const addresses = getContractAddresses(fixture.chain);
  if (!addresses.auction || !addresses.marketplaceSettings) throw new Error('Marketplace configuration is missing.');
  const registry = await fixture.publicClient.readContract({ address: addresses.auction,
    abi: parseAbi(['function spaceOperatorRegistry() view returns (address)']), functionName: 'spaceOperatorRegistry' });
  const isSpace = await fixture.publicClient.readContract({ address: registry,
    abi: parseAbi(['function isApprovedSpaceOperator(address) view returns (bool)']),
    functionName: 'isApprovedSpaceOperator', args: [fixture.sellerAddress] });
  const percentage = isSpace
    ? await fixture.publicClient.readContract({ address: registry,
      abi: parseAbi(['function getPlatformCommission(address) view returns (uint256)']),
      functionName: 'getPlatformCommission', args: [fixture.sellerAddress] })
    : await fixture.publicClient.readContract({ address: addresses.marketplaceSettings,
      abi: parseAbi(['function getERC721ContractPrimarySaleFeePercentage(address) view returns (uint8)']),
      functionName: 'getERC721ContractPrimarySaleFeePercentage', args: [contract] });
  return amount - amount * BigInt(percentage) / 100n;
}
