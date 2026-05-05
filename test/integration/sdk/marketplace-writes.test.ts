import { afterEach, describe, expect, it, vi } from 'vitest';
import { maxUint256, parseEther } from 'viem';
import { createRareClient } from '../../../src/sdk/client.js';
import {
  buyerAddress,
  createFakePublicClient,
  createFakeWalletClient,
  erc20Currency,
  makeHash,
  makeReceipt,
  marketplaceSettings,
  nftContract,
  sellerAddress,
} from '../../helpers/fakeViem.js';

const ETH_ADDRESS = '0x0000000000000000000000000000000000000000' as const;
const AUCTION_TYPE = `0x${'11'.repeat(32)}` as const;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('listing write flows', () => {
  it('auto-approves before creating a listing when needed', async () => {
    const publicClient = createFakePublicClient({
      reads: [false, true],
      receipts: [makeReceipt({ transactionHash: makeHash(1) }), makeReceipt({ transactionHash: makeHash(2) })],
    });
    const walletClient = createFakeWalletClient({ hashes: [makeHash(1), makeHash(2)] });
    const rare = createRareClient({ publicClient, walletClient });

    const result = await rare.listing.create({
      contract: nftContract,
      tokenId: '1',
      price: '1',
    });

    expect(publicClient.readCalls.map((call) => call.functionName)).toEqual([
      'isApprovedForAll',
      'isApprovedForAll',
    ]);
    expect(walletClient.writeCalls.map((call) => call.functionName)).toEqual([
      'setApprovalForAll',
      'setSalePrice',
    ]);
    expect(walletClient.writeCalls[1].args).toEqual([
      nftContract,
      1n,
      ETH_ADDRESS,
      parseEther('1'),
      ETH_ADDRESS,
      [sellerAddress],
      [100],
    ]);
    expect(result.approvalTxHash).toBe(makeHash(1));
  });

  it('skips listing approval checks when autoApprove is false', async () => {
    const publicClient = createFakePublicClient();
    const walletClient = createFakeWalletClient();
    const rare = createRareClient({ publicClient, walletClient });

    await rare.listing.create({
      contract: nftContract,
      tokenId: 2,
      price: '0.5',
      autoApprove: false,
    });

    expect(publicClient.readCalls).toEqual([]);
    expect(walletClient.writeCalls.map((call) => call.functionName)).toEqual(['setSalePrice']);
  });

  it('cancels listings with the public-listing target by default', async () => {
    const walletClient = createFakeWalletClient();
    const rare = createRareClient({ publicClient: createFakePublicClient(), walletClient });

    await rare.listing.cancel({ contract: nftContract, tokenId: '3' });

    expect(walletClient.writeCalls[0].functionName).toBe('removeSalePrice');
    expect(walletClient.writeCalls[0].args).toEqual([nftContract, 3n, ETH_ADDRESS]);
  });

  it('buys listings with ETH value including marketplace fee', async () => {
    const publicClient = createFakePublicClient({
      reads: [marketplaceSettings, parseEther('0.01')],
    });
    const walletClient = createFakeWalletClient();
    const rare = createRareClient({ publicClient, walletClient });

    await rare.listing.buy({ contract: nftContract, tokenId: '4', amount: '1' });

    expect(walletClient.writeCalls[0].functionName).toBe('buy');
    expect(walletClient.writeCalls[0].args).toEqual([nftContract, 4n, ETH_ADDRESS, parseEther('1')]);
    expect(walletClient.writeCalls[0].value).toBe(parseEther('1.01'));
  });
});

describe('auction write flows', () => {
  it('creates an auction after approval and auction type lookup', async () => {
    const publicClient = createFakePublicClient({
      reads: [false, true, AUCTION_TYPE],
      receipts: [makeReceipt({ transactionHash: makeHash(1) }), makeReceipt({ transactionHash: makeHash(2) })],
    });
    const walletClient = createFakeWalletClient({ hashes: [makeHash(1), makeHash(2)] });
    const rare = createRareClient({ publicClient, walletClient });

    await rare.auction.create({
      contract: nftContract,
      tokenId: '3',
      startingPrice: '2',
      duration: '3600',
    });

    expect(publicClient.readCalls.map((call) => call.functionName)).toEqual([
      'isApprovedForAll',
      'isApprovedForAll',
      'COLDIE_AUCTION',
    ]);
    expect(walletClient.writeCalls.map((call) => call.functionName)).toEqual([
      'setApprovalForAll',
      'configureAuction',
    ]);
    expect(walletClient.writeCalls[1].args).toEqual([
      AUCTION_TYPE,
      nftContract,
      3n,
      parseEther('2'),
      ETH_ADDRESS,
      3600n,
      0n,
      [sellerAddress],
      [100],
    ]);
  });

  it('bids with ETH value including marketplace fee', async () => {
    const publicClient = createFakePublicClient({
      reads: [marketplaceSettings, parseEther('0.02')],
    });
    const walletClient = createFakeWalletClient();
    const rare = createRareClient({ publicClient, walletClient });

    await rare.auction.bid({ contract: nftContract, tokenId: '8', amount: '1' });

    expect(walletClient.writeCalls[0].functionName).toBe('bid');
    expect(walletClient.writeCalls[0].args).toEqual([nftContract, 8n, ETH_ADDRESS, parseEther('1')]);
    expect(walletClient.writeCalls[0].value).toBe(parseEther('1.02'));
  });

  it('settles and cancels auctions with normalized token IDs', async () => {
    const walletClient = createFakeWalletClient();
    const rare = createRareClient({ publicClient: createFakePublicClient(), walletClient });

    await rare.auction.settle({ contract: nftContract, tokenId: '9' });
    await rare.auction.cancel({ contract: nftContract, tokenId: 10 });

    expect(walletClient.writeCalls.map((call) => call.functionName)).toEqual(['settleAuction', 'cancelAuction']);
    expect(walletClient.writeCalls[0].args).toEqual([nftContract, 9n]);
    expect(walletClient.writeCalls[1].args).toEqual([nftContract, 10n]);
  });
});

describe('offer write flows and payment preparation', () => {
  it('attaches ETH amount plus marketplace fee for ETH offers', async () => {
    const publicClient = createFakePublicClient({
      reads: [marketplaceSettings, parseEther('0.05')],
    });
    const walletClient = createFakeWalletClient();
    const rare = createRareClient({ publicClient, walletClient });

    await rare.offer.create({
      contract: nftContract,
      tokenId: '4',
      amount: '1',
    });

    expect(publicClient.readCalls.map((call) => call.functionName)).toEqual([
      'marketplaceSettings',
      'calculateMarketplaceFee',
    ]);
    expect(walletClient.writeCalls[0].functionName).toBe('offer');
    expect(walletClient.writeCalls[0].value).toBe(parseEther('1.05'));
  });

  it('approves ERC20 currency when allowance is below the requested amount', async () => {
    const publicClient = createFakePublicClient({
      reads: [1n],
      receipts: [makeReceipt({ transactionHash: makeHash(1) }), makeReceipt({ transactionHash: makeHash(2) })],
    });
    const walletClient = createFakeWalletClient({ hashes: [makeHash(1), makeHash(2)] });
    const rare = createRareClient({ publicClient, walletClient });

    await rare.offer.create({
      contract: nftContract,
      tokenId: '5',
      amount: '2',
      currency: erc20Currency,
    });

    expect(publicClient.readCalls[0].functionName).toBe('allowance');
    expect(walletClient.writeCalls.map((call) => call.functionName)).toEqual(['approve', 'offer']);
    expect(walletClient.writeCalls[0].address).toBe(erc20Currency);
    expect(walletClient.writeCalls[0].args).toEqual([rare.contracts.auction, maxUint256]);
    expect(walletClient.writeCalls[1].value).toBe(0n);
  });

  it('does not approve ERC20 currency when allowance already covers the amount', async () => {
    const publicClient = createFakePublicClient({
      reads: [parseEther('2')],
    });
    const walletClient = createFakeWalletClient();
    const rare = createRareClient({ publicClient, walletClient });

    await rare.offer.create({
      contract: nftContract,
      tokenId: '6',
      amount: '1',
      currency: erc20Currency,
    });

    expect(walletClient.writeCalls.map((call) => call.functionName)).toEqual(['offer']);
    expect(walletClient.writeCalls[0].value).toBe(0n);
  });

  it('approves ERC20 currency if allowance reads fail', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const publicClient = createFakePublicClient({
      reads: [new Error('allowance unavailable')],
      receipts: [makeReceipt({ transactionHash: makeHash(1) }), makeReceipt({ transactionHash: makeHash(2) })],
    });
    const walletClient = createFakeWalletClient({ hashes: [makeHash(1), makeHash(2)] });
    const rare = createRareClient({ publicClient, walletClient });

    await rare.offer.create({
      contract: nftContract,
      tokenId: '7',
      amount: '1',
      currency: erc20Currency,
    });

    expect(warn).toHaveBeenCalledWith(
      'ERC20 allowance check failed, approving unconditionally:',
      'allowance unavailable',
    );
    expect(walletClient.writeCalls.map((call) => call.functionName)).toEqual(['approve', 'offer']);
  });

  it('cancels and accepts offers with default currency and split recipients', async () => {
    const walletClient = createFakeWalletClient();
    const rare = createRareClient({ publicClient: createFakePublicClient(), walletClient });

    await rare.offer.cancel({ contract: nftContract, tokenId: '11' });
    await rare.offer.accept({ contract: nftContract, tokenId: '12', amount: '1' });

    expect(walletClient.writeCalls.map((call) => call.functionName)).toEqual(['cancelOffer', 'acceptOffer']);
    expect(walletClient.writeCalls[0].args).toEqual([nftContract, 11n, ETH_ADDRESS]);
    expect(walletClient.writeCalls[1].args).toEqual([
      nftContract,
      12n,
      ETH_ADDRESS,
      parseEther('1'),
      [sellerAddress],
      [100],
    ]);
  });

  it('accepts offers with explicit split recipients', async () => {
    const walletClient = createFakeWalletClient();
    const rare = createRareClient({ publicClient: createFakePublicClient(), walletClient });

    await rare.offer.accept({
      contract: nftContract,
      tokenId: '13',
      amount: '1',
      splitAddresses: [buyerAddress, sellerAddress],
      splitRatios: [25, 75],
    });

    expect(walletClient.writeCalls[0].args).toEqual([
      nftContract,
      13n,
      ETH_ADDRESS,
      parseEther('1'),
      [buyerAddress, sellerAddress],
      [25, 75],
    ]);
  });
});
