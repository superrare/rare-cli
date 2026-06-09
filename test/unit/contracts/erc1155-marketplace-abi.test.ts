import { describe, expect, it } from 'vitest';
import { toEventSelector, toFunctionSelector, type AbiEvent, type AbiFunction } from 'viem';
import { rareErc1155MarketplaceAbi } from '../../../src/contracts/abis/rare-erc1155-marketplace.js';

describe('ERC1155 marketplace ABI', () => {
  it('includes the cancel mint direct sales function and cancelled event', () => {
    const cancelMintDirectSales = rareErc1155MarketplaceAbi.find(
      (entry) => entry.type === 'function' && entry.name === 'cancelMintDirectSales',
    ) as AbiFunction | undefined;
    const mintDirectSaleCancelled = rareErc1155MarketplaceAbi.find(
      (entry) => entry.type === 'event' && entry.name === 'MintDirectSaleCancelled',
    ) as AbiEvent | undefined;

    if (!cancelMintDirectSales) {
      throw new Error('cancelMintDirectSales ABI entry is missing.');
    }
    if (!mintDirectSaleCancelled) {
      throw new Error('MintDirectSaleCancelled ABI entry is missing.');
    }

    expect(cancelMintDirectSales.inputs.map((input) => input.type)).toEqual(['address', 'uint256[]']);
    expect(toFunctionSelector(cancelMintDirectSales)).toBe('0x5e50c42e');
    expect(mintDirectSaleCancelled.inputs.map((input) => input.type)).toEqual(['address', 'uint256']);
    expect(toEventSelector(mintDirectSaleCancelled)).toBe(
      '0xda6836b3af7ccd9683b9c04bdbe253e29f59637fae61c508b62142e0c45b6dea',
    );
  });
});
