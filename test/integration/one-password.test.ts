import { describe, expect, it } from 'vitest';
import { isAddressEqual, recoverMessageAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { parsePrivateKeyReference, type PrivateKeyReference } from '../../src/config.js';
import { createOnePasswordAccount, readOnePasswordPrivateKey } from '../../src/one-password.js';
import { loadDotEnv } from '../helpers/env.js';

loadDotEnv();

const otherPrivateKey = '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';

const livePrivateKeyRef = process.env.RARE_CLI_TEST_OP_PRIVATE_KEY_REF?.trim();
const describeLiveOp = livePrivateKeyRef ? describe : describe.skip;

describeLiveOp('1Password CLI live integration', () => {
  it('reads and signs with a real op:// private key reference', async (ctx) => {
    const privateKeyRefFromEnv = parsePrivateKeyReference(
      livePrivateKeyRef!,
      'RARE_CLI_TEST_OP_PRIVATE_KEY_REF',
    );
    const privateKey = await readOnePasswordPrivateKeyOrSkip(ctx, privateKeyRefFromEnv);
    const expectedAccount = privateKeyToAccount(privateKey);
    const account = createOnePasswordAccount({
      address: expectedAccount.address,
      privateKeyRef: privateKeyRefFromEnv,
    });

    const signature = await account.signMessage({ message: 'hello rare from op' });
    const recovered = await recoverMessageAddress({ message: 'hello rare from op', signature });

    expect(isAddressEqual(recovered, expectedAccount.address)).toBe(true);
  }, 30_000);

  it('rejects signing when the real op:// private key does not match the configured address', async (ctx) => {
    const privateKeyRefFromEnv = parsePrivateKeyReference(
      livePrivateKeyRef!,
      'RARE_CLI_TEST_OP_PRIVATE_KEY_REF',
    );
    await readOnePasswordPrivateKeyOrSkip(ctx, privateKeyRefFromEnv);
    const expectedAccount = privateKeyToAccount(otherPrivateKey);
    const account = createOnePasswordAccount({
      address: expectedAccount.address,
      privateKeyRef: privateKeyRefFromEnv,
    });

    await expect(account.signMessage({ message: 'hello rare from op' })).rejects.toThrow(
      `1Password private key at ${privateKeyRefFromEnv} resolves to`,
    );
  }, 30_000);
});

async function readOnePasswordPrivateKeyOrSkip(
  ctx: { skip: (reason?: string) => void },
  privateKeyRefFromEnv: PrivateKeyReference,
): Promise<`0x${string}`> {
  try {
    return await readOnePasswordPrivateKey(privateKeyRefFromEnv);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    ctx.skip(`1Password CLI unavailable or locked: ${message}`);
    throw error;
  }
}
