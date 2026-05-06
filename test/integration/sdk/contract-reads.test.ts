import { beforeAll, describe, expect, it } from 'vitest';
import { isAddress, type Address } from 'viem';
import { createRareClient } from '../../../src/sdk/client.js';
import type { RareClient } from '../../../src/sdk/types.js';
import { createTestSepoliaPublicClient } from '../../helpers/liveViem.js';

type ReadableNftFixture = {
  contract: Address;
  tokenId: string;
};

const setup = Promise.resolve().then(async (): Promise<{ rare: RareClient; fixture: ReadableNftFixture }> => {
  const rare = createRareClient({ publicClient: createTestSepoliaPublicClient() });
  return { rare, fixture: await findReadableSepoliaNft(rare) };
});

beforeAll(async () => {
  await setup;
}, 30_000);

describe('SDK contract read integration', () => {
  it('reads token contract and token info through real RPC', async () => {
    const { rare, fixture } = await setup;
    const contractInfo = await rare.token.getContractInfo({ contract: fixture.contract });
    expect(contractInfo.contract).toBe(fixture.contract);
    expect(contractInfo.chain).toBe('sepolia');
    expect(contractInfo.name).toEqual(expect.any(String));
    expect(contractInfo.symbol).toEqual(expect.any(String));
    expect(contractInfo.totalSupply).toBeGreaterThanOrEqual(1n);

    const tokenInfo = await rare.token.getTokenInfo({
      contract: fixture.contract,
      tokenId: fixture.tokenId,
    });
    expect(tokenInfo.contract).toBe(fixture.contract);
    expect(tokenInfo.tokenId).toBe(BigInt(fixture.tokenId));
    expect(isAddress(tokenInfo.owner)).toBe(true);
    expect(tokenInfo.tokenUri).toEqual(expect.any(String));
  }, 30_000);

  it('reads marketplace listing, offer, and auction status through real RPC', async () => {
    const { rare, fixture } = await setup;
    const [listing, offer, auction] = await Promise.all([
      rare.listing.getStatus({ contract: fixture.contract, tokenId: fixture.tokenId }),
      rare.offer.getStatus({ contract: fixture.contract, tokenId: fixture.tokenId }),
      rare.auction.getStatus({ contract: fixture.contract, tokenId: fixture.tokenId }),
    ]);

    expect(isAddress(listing.seller)).toBe(true);
    expect(isAddress(listing.currencyAddress)).toBe(true);
    expect(listing.hasListing).toBe(listing.amount > 0n);
    expect(listing.isEth).toBe(listing.currencyAddress === '0x0000000000000000000000000000000000000000');

    expect(isAddress(offer.buyer)).toBe(true);
    expect(offer.hasOffer).toBe(offer.amount > 0n);
    expect(typeof offer.convertible).toBe('boolean');

    expect(isAddress(auction.seller)).toBe(true);
    expect(['PENDING', 'RUNNING', 'ENDED']).toContain(auction.status);
    expect(auction.started).toBe(auction.startingTime > 0n);
    if (auction.started) {
      expect(auction.endTime).toBe(auction.startingTime + auction.lengthOfAuction);
    } else {
      expect(auction.endTime).toBeNull();
    }
  }, 30_000);
});

async function findReadableSepoliaNft(rareClient: RareClient): Promise<ReadableNftFixture> {
  const search = await rareClient.search.nfts({ chainId: 11_155_111, page: 1, perPage: 10 });

  for (const nft of search.data) {
    if (!isAddress(nft.contractAddress)) continue;

    const candidate = {
      contract: nft.contractAddress,
      tokenId: nft.tokenId,
    };

    try {
      await rareClient.token.getContractInfo(candidate);
      await rareClient.token.getTokenInfo(candidate);
      return candidate;
    } catch {
      // Keep scanning until we find an indexed Sepolia NFT with standard ERC-721 reads.
    }
  }

  throw new Error('Unable to find a readable Sepolia NFT fixture from the Rare API.');
}
