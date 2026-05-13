import { beforeAll, describe, expect, it } from 'vitest';
import { isAddress, type Address } from 'viem';
import { ETH_ADDRESS, PUBLIC_LISTING_TARGET, type SupportedChain } from '../../../src/contracts/addresses.js';
import { createRareClient } from '../../../src/sdk/client.js';
import type { RareClient } from '../../../src/sdk/types.js';
import { createTestPublicClientContext, hasTestRpcUrl } from '../../helpers/liveViem.js';

type ReadableNftFixture = {
  contract: Address;
  tokenId: string;
};

const describeLive = hasTestRpcUrl() ? describe : describe.skip;
const setup = hasTestRpcUrl()
  ? Promise.resolve().then(async (): Promise<{ rare: RareClient; fixture: ReadableNftFixture; chain: SupportedChain; chainId: number }> => {
      const { publicClient, chain, chainId } = await createTestPublicClientContext();
      const rare = createRareClient({ publicClient });
      return { rare, fixture: await findReadableNft(rare, chainId), chain, chainId };
    })
  : undefined;

describeLive('SDK contract read integration', () => {
  beforeAll(async () => {
    await requireSetup(setup);
  }, 30_000);

  it('reads token contract and token info through real RPC', async () => {
    const { rare, fixture, chain } = await requireSetup(setup);
    const contractInfo = await rare.token.getContractInfo({ contract: fixture.contract });
    expect(contractInfo.contract).toBe(fixture.contract);
    expect(contractInfo.chain).toBe(chain);
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

  it('reads marketplace listing, offer, auction, and release status through real RPC', async () => {
    const { rare, fixture } = await requireSetup(setup);
    const [listing, offer, auction, release] = await Promise.all([
      rare.listing.getStatus({ contract: fixture.contract, tokenId: fixture.tokenId }),
      rare.offer.getStatus({ contract: fixture.contract, tokenId: fixture.tokenId }),
      rare.auction.getStatus({ contract: fixture.contract, tokenId: fixture.tokenId }),
      rare.listing.release.getStatus({ contract: fixture.contract }),
    ]);

    expect(isAddress(listing.seller)).toBe(true);
    expect(isAddress(listing.currencyAddress)).toBe(true);
    expect(listing.hasListing).toBe(listing.amount > 0n);
    expect(listing.isEth).toBe(listing.currencyAddress === ETH_ADDRESS);
    expect(listing.target).toBe(PUBLIC_LISTING_TARGET);
    expect(Array.isArray(listing.splitAddresses)).toBe(true);
    expect(listing.splitAddresses.every((address) => isAddress(address))).toBe(true);
    expect(Array.isArray(listing.splitRatios)).toBe(true);
    expect(listing.splitRatios.every((ratio) => Number.isInteger(ratio))).toBe(true);
    expect(listing.canBuy).toBeNull();

    expect(isAddress(offer.buyer)).toBe(true);
    expect(offer.hasOffer).toBe(offer.amount > 0n);

    expect(isAddress(auction.seller)).toBe(true);
    expect(['PENDING', 'RUNNING', 'ENDED']).toContain(auction.status);
    expect(auction.started).toBe(auction.startingTime > 0n);
    if (auction.started) {
      expect(auction.endTime).toBe(auction.startingTime + auction.lengthOfAuction);
    } else {
      expect(auction.endTime).toBeNull();
    }

    expect(release.contract).toBe(fixture.contract);
    expect(isAddress(release.rareMinter)).toBe(true);
    expect(release.configured).toBe(release.seller !== ETH_ADDRESS);
    expect(release.currentlyMintable).toBeTypeOf('boolean');
    expect(release.splitRecipients.length).toBe(release.splitRatios.length);
  }, 30_000);
});

async function requireSetup(
  setup: Promise<{ rare: RareClient; fixture: ReadableNftFixture; chain: SupportedChain; chainId: number }> | undefined,
): Promise<{ rare: RareClient; fixture: ReadableNftFixture; chain: SupportedChain; chainId: number }> {
  if (!setup) {
    throw new Error('SDK contract read integration setup did not run.');
  }
  return setup;
}

async function findReadableNft(rareClient: RareClient, chainId: number): Promise<ReadableNftFixture> {
  const search = await rareClient.search.nfts({ chainId, page: 1, perPage: 10 });

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

  throw new Error(`Unable to find a readable NFT fixture for chain ${chainId} from the Rare API.`);
}
