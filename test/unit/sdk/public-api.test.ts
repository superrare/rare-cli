import { afterEach, describe, expect, it, vi } from 'vitest';
import { createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';
import * as client from '@rareprotocol/rare-sdk/index';
import * as contracts from '@rareprotocol/rare-sdk/contracts';
import * as utils from '@rareprotocol/rare-sdk/public-utils';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('public SDK API surface', () => {
  it('keeps the client runtime exports focused on the high-level SDK', () => {
    expect(Object.keys(client).sort()).toEqual([
      'ApprovalSideEffectError',
      'Erc1155CheckoutAllItemsSkippedError',
      'NftApprovalRequiredError',
      'PaymentApprovalRequiredError',
      'createRareClient',
    ]);
  });

  it('constructs the SDK client when process is unavailable', () => {
    vi.stubGlobal('process', undefined);

    const rare = client.createRareClient({
      publicClient: createPublicClient({
        chain: mainnet,
        transport: http('http://127.0.0.1:8545'),
      }),
    });

    expect(rare.chain).toBe('mainnet');
    expect(rare.chainId).toBe(1);
  });

  it('exposes contract building blocks from the contracts subpath', () => {
    expect(contracts).toHaveProperty('auctionAbi');
    expect(contracts).toHaveProperty('contractAddresses');
    expect(contracts).toHaveProperty('getCcipChainSelector');
    expect(contracts).toHaveProperty('getContractAddresses');
    expect(contracts).toHaveProperty('getRareBridgeAddress');
    expect(contracts).toHaveProperty('isSupportedChain');
    expect(contracts).toHaveProperty('rareBridgeAbi');
  });

  it('exposes standalone pure helpers from the utils subpath', () => {
    expect(Object.keys(utils).sort()).toEqual([
      'buildUtilsMerkleProof',
      'buildUtilsTree',
      'getUtilsTreeProof',
      'verifyUtilsTreeProof',
    ]);
  });
});
