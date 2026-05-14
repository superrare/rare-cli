import { describe, expect, it } from 'vitest';
import { parseConfig, setChainConfig, type Config } from '../../src/config.js';

const accountAddress = '0x0000000000000000000000000000000000000001';
const alternateAccountAddress = '0x0000000000000000000000000000000000000002';

describe('config parsing', () => {
  it('normalizes plaintext keys, 1Password references, account addresses, and RPC URLs', () => {
    expect(parseConfig({
      defaultChain: 'base',
      chains: {
        sepolia: {
          privateKey: '0xabc123',
          privateKeyRef: 'op://Private/rare-sepolia/private-key',
          accountAddress,
          rpcUrl: 'http://127.0.0.1:8545',
        },
      },
    })).toEqual({
      defaultChain: 'base',
      chains: {
        sepolia: {
          privateKey: '0xabc123',
          privateKeyRef: 'op://Private/rare-sepolia/private-key',
          accountAddress,
          rpcUrl: 'http://127.0.0.1:8545',
        },
      },
    });
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
