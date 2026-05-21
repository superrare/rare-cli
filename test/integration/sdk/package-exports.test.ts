import { describe, expect, it } from 'vitest';
import type { Address } from 'viem';
import { ETH_ADDRESS } from '../../../src/contracts/addresses.js';

const contractAddress = '0x1111111111111111111111111111111111111111' satisfies Address;

describe('published package subpath exports', () => {
  it('loads the built client, contracts, and utils subpaths through package exports', async () => {
    const client = await import('@rareprotocol/rare-cli/client');
    const contracts = await import('@rareprotocol/rare-cli/contracts');
    const utils = await import('@rareprotocol/rare-cli/utils');

    expect(Object.keys(client).sort()).toEqual([
      'NftApprovalRequiredError',
      'PaymentApprovalRequiredError',
      'createRareClient',
    ]);
    expect(contracts).toHaveProperty('getContractAddresses');
    expect(contracts).toHaveProperty('liquidRouterAbi');
    expect(Object.keys(utils).sort()).toEqual([
      'buildUtilsMerkleProof',
      'buildUtilsTree',
      'getUtilsTreeProof',
      'verifyUtilsTreeProof',
    ]);
  });

  it('executes the public utils helpers from the built utils subpath', async () => {
    const utils = await import('@rareprotocol/rare-cli/utils');

    const tree = utils.buildUtilsTree({
      content: [
        'contract_address,token_id,chain_id',
        `${contractAddress},2,11155111`,
        `${contractAddress},1,11155111`,
      ].join('\n'),
      format: 'csv',
    });
    const proof = utils.getUtilsTreeProof({
      artifact: tree,
      contractAddress,
      tokenId: 1,
    });

    expect(tree.tokens.map((token) => token.tokenId)).toEqual(['1', '2']);
    expect(proof.valid).toBe(true);
    expect(utils.verifyUtilsTreeProof({
      root: tree.root,
      contractAddress,
      tokenId: 1,
      proof: proof.proof,
    })).toBe(true);
    expect(utils.buildUtilsMerkleProof({
      artifact: {
        root: '0xa01f005c90f56c0f2b981e045caf4949f489bf82e5d3c49effb1334cab26043a',
        currency: ETH_ADDRESS,
        amount: '1',
        splitAddresses: [],
        splitRatios: [],
        tokens: [
          { contract: contractAddress, tokenId: '1' },
          { contract: contractAddress, tokenId: '2' },
        ],
      },
      contract: contractAddress,
      tokenId: '1',
    }).proof).toEqual([
      '0xfde38319eec56e703ba771c1e2abddca86188674940372bdfed26cec392ec314',
    ]);
  });
});
