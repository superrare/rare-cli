import { describe, expect, it } from 'vitest';
import {
  chainIds,
  getContractAddresses,
  getErc721ApprovalManagerAddress,
  isSupportedChain,
  resolveCurrency,
} from '../../../src/contracts/addresses.js';

describe('chain and currency helpers', () => {
  it('recognizes supported chains and exposes chain IDs', () => {
    expect(isSupportedChain('sepolia')).toBe(true);
    expect(isSupportedChain('base-sepolia')).toBe(true);
    expect(isSupportedChain('unknown')).toBe(false);
    expect(chainIds.sepolia).toBe(11_155_111);
  });

  it('resolves deployed contract addresses for configured chains', () => {
    expect(getContractAddresses('sepolia')).toEqual({
      factory: '0x3c7526a0975156299ceef369b8ff3c01cc670523',
      auction: '0xC8Edc7049b233641ad3723D6C60019D1c8771612',
      batchListing: '0xF2bE72d4343beD375Cb6d0E799a3c003163860e0',
      erc721ApprovalManager: '0x5fa0a461d3a2Ea3bFDf03e8BD37CAbB4ae84205E',
    });
  });

  it('resolves the ERC721 approval manager for supported chains', () => {
    expect(getErc721ApprovalManagerAddress('sepolia')).toBe(
      '0x5fa0a461d3a2Ea3bFDf03e8BD37CAbB4ae84205E',
    );
  });

  it('resolves named currencies and custom ERC20 addresses', () => {
    expect(resolveCurrency('eth', 'sepolia')).toBe('0x0000000000000000000000000000000000000000');
    expect(resolveCurrency('USDC', 'sepolia')).toBe('0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238');
    expect(resolveCurrency('0x1230000000000000000000000000000000000000', 'sepolia')).toBe(
      '0x1230000000000000000000000000000000000000',
    );
  });

  it('rejects unknown currency names', () => {
    expect(() => resolveCurrency('doge', 'sepolia')).toThrow(
      'Unknown currency "doge". Supported: eth, rare, usdc or a 0x address.',
    );
  });
});
