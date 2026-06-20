import { describe, expect, it } from 'vitest';
import { getAddress, parseUnits, type Address } from 'viem';
import type { LiquidCurveSegment } from '../../../src/liquid/curve-config.js';
import {
  buildCreateSovereignErc20MarketRewardsWrite,
  buildCreateSovereignErc20MarketWrite,
  buildCreateSovereignErc20Write,
  planDeploySovereignErc20,
  planDeploySovereignErc20Market,
  planDeploySovereignErc20MarketRewards,
  SOVEREIGN_ERC20_INTERFACE_ID,
  SOVEREIGN_ERC20_MARKET_INTERFACE_ID,
  sovereignErc20KindReadNames,
} from '../../../src/sdk/erc20-core.js';

const accountAddress = getAddress('0x1000000000000000000000000000000000000000');
const delegateOwner = getAddress('0x2000000000000000000000000000000000000000');
const lowerDelegateOwner = '0x2000000000000000000000000000000000000000' satisfies Address;
const rewardTokenAddress = getAddress('0x3000000000000000000000000000000000000000');
const defaults = { accountAddress };
const curve: LiquidCurveSegment = {
  tickLower: -60_000,
  tickUpper: 60_000,
  numPositions: 1,
  shares: '1',
};

describe('Sovereign ERC20 core planning', () => {
  it('defines factory read names for all supported deploy kinds', () => {
    expect(sovereignErc20KindReadNames).toEqual({
      sovereign: 'KIND_SOVEREIGN_ERC20',
      'sovereign-market': 'KIND_SOVEREIGN_ERC20_MARKET',
      'sovereign-market-rewards': 'KIND_SOVEREIGN_ERC20_MARKET_REWARDS',
    });
  });

  it('defines Solidity interface IDs for direct Sovereign ERC20 interfaces', () => {
    expect(SOVEREIGN_ERC20_INTERFACE_ID).toBe('0x4eefb48f');
    expect(SOVEREIGN_ERC20_MARKET_INTERFACE_ID).toBe('0x419c3ac7');
  });

  it('plans core deploys with default blank token URIs, supply parsing, caps, and write args', () => {
    const uncapped = planDeploySovereignErc20({
      name: 'Rare Core Token',
      symbol: 'RCT',
    }, defaults);
    expect(uncapped).toEqual({
      kind: 'sovereign',
      owner: accountAddress,
      tokenUri: '',
      name: 'Rare Core Token',
      symbol: 'RCT',
      initialSupply: 0n,
      maxSupply: 0n,
      accountAddress,
      requiresDelegate: false,
    });
    expect(buildCreateSovereignErc20Write(uncapped)).toEqual({
      functionName: 'createSovereignERC20',
      args: [accountAddress, '', 'Rare Core Token', 'RCT', 0n, 0n],
    });

    const capped = planDeploySovereignErc20({
      name: 'Rare Capped Token',
      symbol: 'CAP',
      tokenUri: '',
      owner: lowerDelegateOwner,
      initialSupply: '10.5',
      maxSupply: '100',
    }, defaults);
    expect(capped).toMatchObject({
      kind: 'sovereign',
      owner: delegateOwner,
      tokenUri: '',
      initialSupply: parseUnits('10.5', 18),
      maxSupply: parseUnits('100', 18),
      accountAddress,
      requiresDelegate: true,
    });

    expect(() => planDeploySovereignErc20({
      name: 'Bad Cap',
      symbol: 'BAD',
      initialSupply: '10',
      maxSupply: '9',
    }, defaults)).toThrow('maxSupply must be 0 for uncapped supply or greater than or equal to initialSupply.');
    expect(() => planDeploySovereignErc20({
      name: 'Unsafe Number',
      symbol: 'BIG',
      initialSupply: 9_007_199_254_740_992,
    }, defaults)).toThrow('initialSupply is too large to pass as a number. Pass it as a string or bigint to avoid precision loss.');
  });

  it('plans market deploys with positive supply, curve validation, owner overrides, and write args', () => {
    const plan = planDeploySovereignErc20Market({
      name: 'Rare Market Token',
      symbol: 'RMT',
      tokenUri: 'ipfs://token',
      owner: delegateOwner,
      initialSupply: '1',
      curves: [curve],
    }, defaults);

    expect(plan).toEqual({
      kind: 'sovereign-market',
      owner: delegateOwner,
      tokenUri: 'ipfs://token',
      name: 'Rare Market Token',
      symbol: 'RMT',
      initialSupply: parseUnits('1', 18),
      maxSupply: parseUnits('1', 18),
      accountAddress,
      requiresDelegate: true,
      curves: [{
        ...curve,
        sharesWei: parseUnits('1', 18),
      }],
    });
    expect(buildCreateSovereignErc20MarketWrite(plan)).toEqual({
      functionName: 'createSovereignERC20Market',
      args: [
        delegateOwner,
        'ipfs://token',
        'Rare Market Token',
        'RMT',
        parseUnits('1', 18),
        [{ tickLower: -60_000, tickUpper: 60_000, numPositions: 1, shares: parseUnits('1', 18) }],
      ],
    });

    expect(() => planDeploySovereignErc20Market({
      name: 'No Curves',
      symbol: 'NCV',
      initialSupply: '1',
      curves: [],
    }, defaults)).toThrow('curves must contain at least one segment.');
    expect(() => planDeploySovereignErc20Market({
      name: 'Zero Initial',
      symbol: 'ZERO',
      initialSupply: '0',
      curves: [curve],
    }, defaults)).toThrow('initialSupply must be greater than 0.');
    expect(() => planDeploySovereignErc20Market({
      name: 'Bad Curve',
      symbol: 'BAD',
      initialSupply: '1',
      curves: [{ ...curve, tickLower: 60_000, tickUpper: -60_000 }],
    }, defaults)).toThrow('curve.tickLower must be less than curve.tickUpper.');
    expect(() => planDeploySovereignErc20Market({
      name: 'Bad Shares',
      symbol: 'BAD',
      initialSupply: '1',
      curves: [{ ...curve, shares: '0.5' }],
    }, defaults)).toThrow('Curve share values must add up to 1.');
  });

  it('plans market rewards deploys with approved reward token names', () => {
    const selfRewards = planDeploySovereignErc20MarketRewards({
      name: 'Self Rewards Token',
      symbol: 'SRT',
      initialSupply: '1',
      curves: [curve],
      rewardToken: 'self',
    }, defaults);
    expect(selfRewards).toMatchObject({
      kind: 'sovereign-market-rewards',
      owner: accountAddress,
      tokenUri: '',
      rewardToken: 'self',
    });

    expect(planDeploySovereignErc20MarketRewards({
      name: 'Rare Rewards Token',
      symbol: 'RRT',
      initialSupply: '1',
      curves: [curve],
      rewardToken: 'rare',
    }, defaults).rewardToken).toBe('rare');
    expect(planDeploySovereignErc20MarketRewards({
      name: 'USDC Rewards Token',
      symbol: 'URT',
      initialSupply: '1',
      curves: [curve],
      rewardToken: 'usdc',
    }, defaults).rewardToken).toBe('usdc');

    expect(buildCreateSovereignErc20MarketRewardsWrite(selfRewards, rewardTokenAddress)).toEqual({
      functionName: 'createSovereignERC20MarketRewards',
      args: [
        accountAddress,
        '',
        'Self Rewards Token',
        'SRT',
        parseUnits('1', 18),
        [{ tickLower: -60_000, tickUpper: 60_000, numPositions: 1, shares: parseUnits('1', 18) }],
        rewardTokenAddress,
      ],
    });
  });

  it('rejects blank display fields before planning writes', () => {
    expect(() => planDeploySovereignErc20({
      name: '',
      symbol: 'BLANK',
    }, defaults)).toThrow('name must not be blank.');
    expect(() => planDeploySovereignErc20({
      name: 'Blank Symbol',
      symbol: '   ',
    }, defaults)).toThrow('symbol must not be blank.');
  });
});
