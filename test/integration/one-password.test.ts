import { describe, expect, it } from 'vitest';
import { isAddressEqual, recoverMessageAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { parsePrivateKeyReference, type PrivateKeyReference } from '../../src/config.js';
import { createOnePasswordAccount, readOnePasswordPrivateKey } from '../../src/one-password.js';
import { loadDotEnv } from '../helpers/env.js';

loadDotEnv();

const privateKey = '0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
const otherPrivateKey = '0xabcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
const privateKeyRef: PrivateKeyReference = 'op://Private/rare-sepolia/private-key';

describe('1Password account adapter integration', () => {
  it('does not resolve the private key when constructing the account', () => {
    const expectedAccount = privateKeyToAccount(privateKey);

    expect(() => createOnePasswordAccount({
      address: expectedAccount.address,
      privateKeyRef,
      resolvePrivateKey: async () => {
        throw new Error('resolver should not be called during account construction');
      },
    })).not.toThrow();
  });

  it('resolves the private key when signing', async () => {
    const expectedAccount = privateKeyToAccount(privateKey);
    const account = createOnePasswordAccount({
      address: expectedAccount.address,
      privateKeyRef,
      resolvePrivateKey: async () => privateKey,
    });

    const signature = await account.signMessage({ message: 'hello rare' });
    const recovered = await recoverMessageAddress({ message: 'hello rare', signature });

    expect(isAddressEqual(recovered, expectedAccount.address)).toBe(true);
  });

  it('rejects signing when the resolved private key does not match the configured address', async () => {
    const expectedAccount = privateKeyToAccount(otherPrivateKey);
    const account = createOnePasswordAccount({
      address: expectedAccount.address,
      privateKeyRef,
      resolvePrivateKey: async () => privateKey,
    });

    await expect(account.signMessage({ message: 'hello rare' })).rejects.toThrow(
      '1Password private key at op://Private/rare-sepolia/private-key resolves to',
    );
  });
});

const livePrivateKeyRef = process.env.RARE_CLI_TEST_OP_PRIVATE_KEY_REF?.trim();
const describeLiveOp = livePrivateKeyRef ? describe : describe.skip;

describeLiveOp('1Password CLI live integration', () => {
  it('reads and signs with a real op:// private key reference', async () => {
    if (livePrivateKeyRef === undefined) {
      throw new Error('RARE_CLI_TEST_OP_PRIVATE_KEY_REF must be set for live 1Password integration tests.');
    }

    const privateKeyRefFromEnv = parsePrivateKeyReference(
      livePrivateKeyRef,
      'RARE_CLI_TEST_OP_PRIVATE_KEY_REF',
    );
    const expectedAccount = privateKeyToAccount(await readOnePasswordPrivateKey(privateKeyRefFromEnv));
    const account = createOnePasswordAccount({
      address: expectedAccount.address,
      privateKeyRef: privateKeyRefFromEnv,
    });

    const signature = await account.signMessage({ message: 'hello rare from op' });
    const recovered = await recoverMessageAddress({ message: 'hello rare from op', signature });

    expect(isAddressEqual(recovered, expectedAccount.address)).toBe(true);
  }, 30_000);
});
