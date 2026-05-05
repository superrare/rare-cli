import { describe, expect, it } from 'vitest';
import {
  chainIds,
  getCanonicalRareEthPool,
  getCanonicalUsdcEthPool,
  getContractAddresses,
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
      liquidFactory: '0xfD18C0D99e5b6F89F3538806241C2C0d6FD728Ac',
      swapRouter: '0x429c3Ee66E7f6CDA12C5BadE4104aF3277aA2305',
      v4Quoter: '0x61B3f2011A92d183C7dbaDBdA940a7555Ccf9227',
    });
  });

  it('resolves canonical V4 pools separately from contract addresses', () => {
    expect(getCanonicalRareEthPool('sepolia')).toEqual({
      currency0: '0x0000000000000000000000000000000000000000',
      currency1: '0x197FaeF3f59eC80113e773Bb6206a17d183F97CB',
      fee: 3000,
      tickSpacing: 60,
      hooks: '0x0000000000000000000000000000000000000000',
      poolId: '0x781d2707a6eb9cd3bdbea356a0ba90f9c5ef274927f5e72b0060bba5abd94f03',
    });
    expect(getCanonicalUsdcEthPool('sepolia')).toMatchObject({
      currency1: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      fee: 3000,
      tickSpacing: 60,
    });
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
