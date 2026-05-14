import { describe, expect, it } from 'vitest';
import { parseConfig, setChainConfig, type Config } from '../../src/config.js';

const walletAddress = '0x0000000000000000000000000000000000000001';
const alternateWalletAddress = '0x0000000000000000000000000000000000000002';

describe('config parsing', () => {
  it('normalizes plaintext keys, 1Password references, wallet addresses, and RPC URLs', () => {
    expect(parseConfig({
      defaultChain: 'base',
      chains: {
        sepolia: {
          privateKey: '0xabc123',
          privateKeyRef: 'op://Private/rare-sepolia/private-key',
          walletAddress,
          rpcUrl: 'http://127.0.0.1:8545',
        },
      },
    })).toEqual({
      defaultChain: 'base',
      chains: {
        sepolia: {
          privateKey: '0xabc123',
          privateKeyRef: 'op://Private/rare-sepolia/private-key',
          walletAddress,
          rpcUrl: 'http://127.0.0.1:8545',
        },
      },
    });
  });

  it('ignores invalid 1Password references and wallet addresses', () => {
    expect(parseConfig({
      chains: {
        sepolia: {
          privateKeyRef: 'not-op',
          walletAddress: 'not-an-address',
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
          walletAddress: 'not-an-address',
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
      walletAddress: alternateWalletAddress,
    });

    expect(JSON.parse(JSON.stringify(next))).toEqual({
      chains: {
        sepolia: {
          privateKeyRef: 'op://Private/rare-sepolia/private-key',
          walletAddress: alternateWalletAddress,
          rpcUrl: 'http://127.0.0.1:8545',
        },
      },
    });
  });
});
