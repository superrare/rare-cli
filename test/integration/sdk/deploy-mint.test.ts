import { describe, expect, it } from 'vitest';
import { createRareClient } from '../../../src/sdk/client.js';
import {
  buyerAddress,
  createFakePublicClient,
  createFakeWalletClient,
  deployedContract,
  makeFactoryCreatedLog,
  makeReceipt,
  makeTransferLog,
  nftContract,
  sellerAddress,
} from '../../helpers/fakeViem.js';

describe('deploy and mint SDK flows', () => {
  it('deploys an ERC-721 collection and parses the created contract event', async () => {
    const publicClient = createFakePublicClient({
      receipts: [makeReceipt({ logs: [makeFactoryCreatedLog()] })],
    });
    const walletClient = createFakeWalletClient();
    const rare = createRareClient({ publicClient, walletClient });

    const result = await rare.deploy.erc721({ name: 'Rare Test', symbol: 'RTST', maxTokens: '25' });

    expect(walletClient.writeCalls).toHaveLength(1);
    expect(walletClient.writeCalls[0].functionName).toBe('createSovereignBatchMint');
    expect(walletClient.writeCalls[0].args).toEqual(['Rare Test', 'RTST', 25n]);
    expect(result.contract).toBe(deployedContract);
  });

  it('deploys without maxTokens when the optional cap is omitted', async () => {
    const publicClient = createFakePublicClient({
      receipts: [makeReceipt({ logs: [makeFactoryCreatedLog()] })],
    });
    const walletClient = createFakeWalletClient();
    const rare = createRareClient({ publicClient, walletClient });

    await rare.deploy.erc721({ name: 'Open Edition', symbol: 'OPEN' });

    expect(walletClient.writeCalls[0].functionName).toBe('createSovereignBatchMint');
    expect(walletClient.writeCalls[0].args).toEqual(['Open Edition', 'OPEN']);
  });

  it('throws when deploy succeeds without the created-contract event', async () => {
    const publicClient = createFakePublicClient({
      receipts: [makeReceipt()],
    });
    const rare = createRareClient({ publicClient, walletClient: createFakeWalletClient() });

    await expect(rare.deploy.erc721({ name: 'Rare Test', symbol: 'RTST' })).rejects.toThrow(
      'SovereignBatchMintCreated event was not found',
    );
  });

  it('mints with addNewToken when no receiver overrides are supplied', async () => {
    const publicClient = createFakePublicClient({
      receipts: [makeReceipt({ logs: [makeTransferLog({ tokenId: 7n })] })],
    });
    const walletClient = createFakeWalletClient();
    const rare = createRareClient({ publicClient, walletClient });

    const result = await rare.mint.mintTo({ contract: nftContract, tokenUri: 'ipfs://token-7' });

    expect(walletClient.writeCalls[0].functionName).toBe('addNewToken');
    expect(walletClient.writeCalls[0].args).toEqual(['ipfs://token-7']);
    expect(result.tokenId).toBe(7n);
  });

  it('mints with mintTo when receiver overrides are supplied', async () => {
    const publicClient = createFakePublicClient({
      receipts: [makeReceipt({ logs: [makeTransferLog({ tokenId: 8n, to: buyerAddress })] })],
    });
    const walletClient = createFakeWalletClient();
    const rare = createRareClient({ publicClient, walletClient });

    const result = await rare.mint.mintTo({
      contract: nftContract,
      tokenUri: 'ipfs://token-8',
      to: buyerAddress,
    });

    expect(walletClient.writeCalls[0].functionName).toBe('mintTo');
    expect(walletClient.writeCalls[0].args).toEqual(['ipfs://token-8', buyerAddress, sellerAddress]);
    expect(result.tokenId).toBe(8n);
  });

  it('throws when mint succeeds without a Transfer event', async () => {
    const publicClient = createFakePublicClient({
      receipts: [makeReceipt()],
    });
    const rare = createRareClient({ publicClient, walletClient: createFakeWalletClient() });

    await expect(rare.mint.mintTo({ contract: nftContract, tokenUri: 'ipfs://token' })).rejects.toThrow(
      'Transfer event was not found',
    );
  });
});
