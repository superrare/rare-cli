import { describe, expect, it } from 'vitest';
import * as client from '../../../src/sdk/index.js';
import * as contracts from '../../../src/sdk/contracts.js';
import * as utils from '../../../src/sdk/public-utils.js';

describe('public SDK API surface', () => {
  it('keeps the client runtime exports focused on the high-level SDK', () => {
    expect(Object.keys(client).sort()).toEqual([
      'NftApprovalRequiredError',
      'PaymentApprovalRequiredError',
      'createRareClient',
    ]);
  });

  it('exposes contract building blocks from the contracts subpath', () => {
    expect(contracts).toHaveProperty('auctionAbi');
    expect(contracts).toHaveProperty('contractAddresses');
    expect(contracts).toHaveProperty('getContractAddresses');
    expect(contracts).toHaveProperty('isSupportedChain');
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
