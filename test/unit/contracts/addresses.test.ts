import { describe, expect, it } from 'vitest';
import { getAddress } from 'viem';
import {
  chainIds,
  ETH_ADDRESS,
  getCanonicalRareEthPool,
  getCanonicalUsdcEthPool,
  getContractAddresses,
  getErc721ApprovalManagerAddress,
  getCcipChainSelector,
  getRareBridgeAddress,
  getRareMinterAddress,
  isSupportedChain,
  listCurrencies,
  requireContractAddress,
  resolveCurrency,
  resolveCurrencyInfo,
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
      factory: getAddress('0x3c7526a0975156299ceef369b8ff3c01cc670523'),
      auction: getAddress('0xC8Edc7049b233641ad3723D6C60019D1c8771612'),
      rareBridge: getAddress('0xdC168291658f6C5F1D0b33E573c4d289DCA9dD08'),
      sovereignFactory: getAddress('0x46B2850ba7787734F648A6848b5eDE0815C1F8Bf'),
      lazySovereignFactory: getAddress('0xc5B8Ad9003673a23d005A6448C74d8955a1a38fA'),
      rareMinter: getAddress('0xd28Dc0B89104d7BBd902F338a0193fF063617ccE'),
      lazyBatchMintFactory: getAddress('0xE5efBA88D556aDA98124654fE505465b8d494858'),
      batchListing: getAddress('0xF2bE72d4343beD375Cb6d0E799a3c003163860e0'),
      batchOfferCreator: getAddress('0x371cca54ef859bb0c7b910581a528ee47773fd56'),
      batchAuctionHouse: getAddress('0x293AE7701A7830B1d38A7608EdF86A106d9E2645'),
      marketplaceSettings: getAddress('0x972dEe8fa339ad2D9c6cbDA31b67f98Fac242d13'),
      erc20ApprovalManager: getAddress('0x4619eB29e84392CE91C27FC936A5c94d1D14b93f'),
      erc721ApprovalManager: getAddress('0x5fa0a461d3a2Ea3bFDf03e8BD37CAbB4ae84205E'),
      liquidFactory: getAddress('0xb1777091C953fa2aC1fD67f2b3e2f61343F5Ce5e'),
      swapRouter: getAddress('0x429c3Ee66E7f6CDA12C5BadE4104aF3277aA2305'),
      v4Quoter: getAddress('0x61B3f2011A92d183C7dbaDBdA940a7555Ccf9227'),
    });
    expect(getRareMinterAddress('sepolia')).toBe('0xd28Dc0B89104d7BBd902F338a0193fF063617ccE');
    expect(getRareBridgeAddress('sepolia')).toBe('0xdC168291658f6C5F1D0b33E573c4d289DCA9dD08');
    expect(getCcipChainSelector('sepolia')).toBe(16015286601757825753n);
    expect(getContractAddresses('mainnet').liquidFactory).toBe('0x25f993C222fE5e891128a782A5168f1C78629540');
  });

  it('resolves canonical V4 pools separately from contract addresses', () => {
    expect(getCanonicalRareEthPool('sepolia')).toEqual({
      currency0: ETH_ADDRESS,
      currency1: '0x197FaeF3f59eC80113e773Bb6206a17d183F97CB',
      fee: 3000,
      tickSpacing: 60,
      hooks: ETH_ADDRESS,
      poolId: '0x781d2707a6eb9cd3bdbea356a0ba90f9c5ef274927f5e72b0060bba5abd94f03',
    });
    expect(getCanonicalUsdcEthPool('sepolia')).toMatchObject({
      currency1: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
      fee: 3000,
      tickSpacing: 60,
    });
  });

  it('resolves the ERC721 approval manager for supported chains', () => {
    expect(getErc721ApprovalManagerAddress('sepolia')).toBe(
      '0x5fa0a461d3a2Ea3bFDf03e8BD37CAbB4ae84205E',
    );
  });

  it('requires optional contract addresses only where configured', () => {
    expect(requireContractAddress('sepolia', 'sovereignFactory')).toBe('0x46B2850ba7787734F648A6848b5eDE0815C1F8Bf');
    expect(requireContractAddress('sepolia', 'lazySovereignFactory')).toBe('0xc5B8Ad9003673a23d005A6448C74d8955a1a38fA');
    expect(requireContractAddress('sepolia', 'rareMinter')).toBe('0xd28Dc0B89104d7BBd902F338a0193fF063617ccE');
    expect(requireContractAddress('sepolia', 'batchOfferCreator')).toBe(getAddress('0x371cca54ef859bb0c7b910581a528ee47773fd56'));
    expect(requireContractAddress('sepolia', 'batchAuctionHouse')).toBe('0x293AE7701A7830B1d38A7608EdF86A106d9E2645');
    expect(() => requireContractAddress('base', 'sovereignFactory')).toThrow(
      'RARE Protocol sovereignFactory contract is not configured on "base".',
    );
    expect(() => requireContractAddress('base', 'lazySovereignFactory')).toThrow(
      'RARE Protocol lazySovereignFactory contract is not configured on "base".',
    );
    expect(() => requireContractAddress('base', 'rareMinter')).toThrow(
      'RARE Protocol rareMinter contract is not configured on "base".',
    );
    expect(() => requireContractAddress('base', 'batchOfferCreator')).toThrow(
      'RARE Protocol batchOfferCreator contract is not configured on "base".',
    );
    expect(() => requireContractAddress('base', 'batchAuctionHouse')).toThrow(
      'RARE Protocol batchAuctionHouse contract is not configured on "base".',
    );
    expect(() => requireContractAddress('base-sepolia', 'batchAuctionHouse')).toThrow(
      'RARE Protocol batchAuctionHouse contract is not configured on "base-sepolia".',
    );
    expect(getContractAddresses('base').factory).toBe(getAddress('0xf776204233bfb52ba0ddff24810cbdbf3dbf94dd'));
    expect(getContractAddresses('base-sepolia').factory).toBe(getAddress('0x2b181ae0f1aea6fed75591b04991b1a3f9868d51'));
  });

  it('resolves named currencies and custom ERC20 addresses', () => {
    expect(resolveCurrency('eth', 'sepolia')).toBe(ETH_ADDRESS);
    expect(resolveCurrency('USDC', 'sepolia')).toBe('0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238');
    expect(resolveCurrency('0x1230000000000000000000000000000000000000', 'sepolia')).toBe(
      '0x1230000000000000000000000000000000000000',
    );
  });

  it('lists and resolves structured currency metadata', () => {
    expect(listCurrencies('sepolia')).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: 'eth', symbol: 'ETH', address: ETH_ADDRESS, decimals: 18, isNative: true }),
      expect.objectContaining({ name: 'rare', symbol: 'RARE', decimals: 18, isNative: false }),
      expect.objectContaining({ name: 'usdc', symbol: 'USDC', decimals: 6, isNative: false }),
    ]));
    expect(resolveCurrencyInfo('usdc', 'sepolia')).toEqual({
      isValid: true,
      currency: expect.objectContaining({
        name: 'usdc',
        address: '0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',
        decimals: 6,
      }),
    });
    expect(resolveCurrencyInfo('0x1230000000000000000000000000000000000000', 'sepolia')).toEqual({
      isValid: true,
      currency: expect.objectContaining({
        name: null,
        symbol: null,
        address: '0x1230000000000000000000000000000000000000',
        decimals: null,
      }),
    });
  });

  it('rejects unknown currency names', () => {
    expect(() => resolveCurrency('doge', 'sepolia')).toThrow(
      'Unknown currency "doge". Supported: eth, rare, usdc or a 0x address.',
    );
  });
});
