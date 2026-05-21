import { describe, expect, it } from 'vitest';
import { parseConfig, setChainConfig, type Config } from '../../src/config.js';

const accountAddress = '0x0000000000000000000000000000000000000001';
const alternateAccountAddress = '0x0000000000000000000000000000000000000002';
const privateKey = '0x1111111111111111111111111111111111111111111111111111111111111111';

describe('config parsing', () => {
  it('normalizes plaintext keys, 1Password references, account addresses, and RPC URLs', () => {
    expect(parseConfig({
      defaultChain: 'base',
      chains: {
        sepolia: {
          privateKey,
          privateKeyRef: 'op://Private/rare-sepolia/private-key',
          accountAddress,
          rpcUrl: 'http://127.0.0.1:8545',
          uniswapApiKey: 'uni-test-key',
          uniswapApiKeyRef: 'op://Private/uniswap/api-key',
        },
      },
    })).toEqual({
      defaultChain: 'base',
      chains: {
        sepolia: {
          privateKey,
          privateKeyRef: 'op://Private/rare-sepolia/private-key',
          accountAddress,
          rpcUrl: 'http://127.0.0.1:8545',
          uniswapApiKey: 'uni-test-key',
          uniswapApiKeyRef: 'op://Private/uniswap/api-key',
        },
      },
    });
  });

  it('rejects malformed persisted private keys', () => {
    expect(() => parseConfig({
      chains: {
        sepolia: {
          privateKey: '0xabc123',
        },
      },
    })).toThrow('chains.sepolia.privateKey must be a 0x-prefixed 32-byte private key.');
  });

  it('migrates legacy wallet addresses to account addresses', () => {
    expect(parseConfig({
      chains: {
        sepolia: {
          privateKeyRef: 'op://Private/rare-sepolia/private-key',
          walletAddress: accountAddress,
        },
      },
    })).toEqual({
      chains: {
        sepolia: {
          privateKeyRef: 'op://Private/rare-sepolia/private-key',
          accountAddress,
        },
      },
    });
  });

  it('ignores invalid 1Password references and account addresses', () => {
    expect(parseConfig({
      chains: {
        sepolia: {
          privateKeyRef: 'not-op',
          accountAddress: 'not-an-address',
          rpcUrl: 'http://127.0.0.1:8545',
        },
      },
    })).toEqual({
      chains: {
        sepolia: {
          rpcUrl: 'http://127.0.0.1:8545',
        },
      },
    });

    expect(parseConfig({
      chains: {
        sepolia: {
          privateKeyRef: 'op://Private/rare-sepolia/private-key',
          accountAddress: 'not-an-address',
        },
      },
    })).toEqual({
      chains: {
        sepolia: {
          privateKeyRef: 'op://Private/rare-sepolia/private-key',
        },
      },
    });
  });

  it('supports key-source replacement without retaining stale plaintext keys', () => {
    const config: Config = {
      chains: {
        sepolia: {
          privateKey: '0xabc123',
          rpcUrl: 'http://127.0.0.1:8545',
        },
      },
    };

    const next = setChainConfig(config, 'sepolia', {
      privateKey: undefined,
      privateKeyRef: 'op://Private/rare-sepolia/private-key',
      accountAddress: alternateAccountAddress,
    });

    expect(JSON.parse(JSON.stringify(next))).toEqual({
      chains: {
        sepolia: {
          privateKeyRef: 'op://Private/rare-sepolia/private-key',
          accountAddress: alternateAccountAddress,
          rpcUrl: 'http://127.0.0.1:8545',
        },
      },
    });
  });
});
