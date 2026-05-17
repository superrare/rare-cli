import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { isAddressEqual, type Address } from 'viem';
import {
  privateKeyToAccount,
  signMessage,
  signTransaction,
  signTypedData,
  toAccount,
  type LocalAccount,
} from 'viem/accounts';
import type { PrivateKeyReference } from './config.js';
import { parsePrivateKey } from './sdk/validation.js';

const execFileAsync = promisify(execFile);

export type PrivateKeyResolver = (privateKeyRef: PrivateKeyReference) => Promise<`0x${string}`>;

export async function readOnePasswordPrivateKey(privateKeyRef: PrivateKeyReference): Promise<`0x${string}`> {
  const secret = await readOnePasswordSecret(privateKeyRef);
  return parsePrivateKey(secret.trim(), `1Password private key at ${privateKeyRef}`);
}

export async function readOnePasswordSecret(privateKeyRef: PrivateKeyReference): Promise<string> {
  try {
    const { stdout } = await execFileAsync('op', ['read', privateKeyRef], {
      encoding: 'utf8',
      maxBuffer: 16 * 1024,
      timeout: 10_000,
      killSignal: 'SIGTERM',
    });
    return stdout.trim();
  } catch (error) {
    throw new Error(`failed to read 1Password secret reference ${privateKeyRef} with "op read"`, { cause: error });
  }
}

export function createOnePasswordAccount(options: {
  address: Address;
  privateKeyRef: PrivateKeyReference;
  resolvePrivateKey?: PrivateKeyResolver;
}): LocalAccount {
  const resolvePrivateKey = options.resolvePrivateKey ?? readOnePasswordPrivateKey;

  async function resolveSigningPrivateKey(): Promise<`0x${string}`> {
    const privateKey = await resolvePrivateKey(options.privateKeyRef);
    const account = privateKeyToAccount(privateKey);
    if (!isAddressEqual(account.address, options.address)) {
      throw new Error(
        `1Password private key at ${options.privateKeyRef} resolves to ${account.address}, ` +
          `but config expects ${options.address}. Run rare configure --chain <chain> --private-key-ref ${options.privateKeyRef}.`,
      );
    }
    return privateKey;
  }

  return toAccount({
    address: options.address,
    async signMessage({ message }) {
      return signMessage({ message, privateKey: await resolveSigningPrivateKey() });
    },
    async signTransaction(transaction, { serializer } = {}) {
      return signTransaction({ transaction, serializer, privateKey: await resolveSigningPrivateKey() });
    },
    async signTypedData(typedData) {
      return signTypedData({ ...typedData, privateKey: await resolveSigningPrivateKey() });
    },
  });
}
