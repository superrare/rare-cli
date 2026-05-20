import { describe, expect, it, vi } from 'vitest';
import {
  createPublicClient,
  custom,
  decodeFunctionData,
  encodeFunctionResult,
} from 'viem';
import { mainnet } from 'viem/chains';
import { tokenAbi } from '../../../src/contracts/abis/token.js';
import { createTokenNamespace } from '../../../src/sdk/token.js';

const contract = '0x1111111111111111111111111111111111111111';

describe('SDK token namespace', () => {
  it('rejects negative token IDs before token reads', async () => {
    const trackFunctionName = vi.fn();
    const publicClient = createPublicClient({
      chain: mainnet,
      transport: custom({
        async request({ method, params }): Promise<`0x${string}`> {
          if (method !== 'eth_call') {
            throw new Error(`unexpected RPC method ${method}`);
          }

          const { functionName } = decodeFunctionData({
            abi: tokenAbi,
            data: getCallData(params),
          });
          trackFunctionName(functionName);

          if (functionName === 'name') {
            return encodeFunctionResult({ abi: tokenAbi, functionName, result: 'Test Token' });
          }
          if (functionName === 'symbol') {
            return encodeFunctionResult({ abi: tokenAbi, functionName, result: 'TEST' });
          }
          if (functionName === 'totalSupply') {
            return encodeFunctionResult({ abi: tokenAbi, functionName, result: 10n });
          }

          throw new Error(`unexpected token read ${functionName}`);
        },
      }),
    });
    const token = createTokenNamespace(publicClient, 'mainnet');

    await expect(token.status({ contract, tokenId: '-1' })).rejects.toThrow(
      'tokenId must be greater than or equal to 0.',
    );
    expect(trackFunctionName).toHaveBeenCalledWith('name');
    expect(trackFunctionName).toHaveBeenCalledWith('symbol');
    expect(trackFunctionName).not.toHaveBeenCalledWith('ownerOf');
    expect(trackFunctionName).not.toHaveBeenCalledWith('tokenURI');
  });
});

function getCallData(params: unknown[] | undefined): `0x${string}` {
  const [call] = params ?? [];
  if (isCallWithData(call)) {
    return call.data;
  }

  throw new Error('eth_call params must include call data');
}

function isCallWithData(value: unknown): value is { data: `0x${string}` } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'data' in value &&
    typeof value.data === 'string' &&
    value.data.startsWith('0x')
  );
}
