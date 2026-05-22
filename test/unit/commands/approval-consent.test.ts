/* eslint-disable functional/immutable-data */
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { MinterApprovalRequiredError, NftApprovalRequiredError } from '../../../src/sdk/approvals-shell.js';
import { PaymentApprovalRequiredError } from '../../../src/sdk/payments-shell.js';
import {
  runWithMinterApprovalConsent,
  runWithNftApprovalConsent,
  runWithPaymentApprovalConsent,
} from '../../../src/commands/approval-consent.js';

const question = vi.hoisted(() => vi.fn(async (): Promise<string> => 'yes'));
const close = vi.hoisted(() => vi.fn());
const createInterface = vi.hoisted(() => vi.fn(() => ({ question, close })));

vi.mock('node:readline/promises', () => ({
  createInterface,
}));

const spenderAddress = '0x8888888888888888888888888888888888888888';
const nftAddress = '0x9999999999999999999999999999999999999999';
const collectionAddress = '0x7777777777777777777777777777777777777777';
const originalStdinIsTty = Object.getOwnPropertyDescriptor(process.stdin, 'isTTY');
let consoleLog: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  question.mockReset();
  close.mockReset();
  createInterface.mockClear();
  consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);
});

afterEach(() => {
  restoreStdinIsTty();
  consoleLog.mockRestore();
});

test('payment approval consent rejects non-interactive prompts before retrying with approval', async () => {
  setStdinIsTty(false);
  const runWithApproval = vi.fn(async (): Promise<string> => 'approved');

  await expect(runWithPaymentApprovalConsent({
    commandName: 'rare offer create',
    approvalMessage: 'ERC20 approval is required before creating this offer.',
    runWithoutApproval: async () => {
      throw new PaymentApprovalRequiredError({ requiredAmount: 5n, spenderAddress });
    },
    runWithApproval,
  })).rejects.toThrow('rare offer create requires --yes when an ERC20 approval is required in non-interactive mode.');

  expect(runWithApproval).not.toHaveBeenCalled();
  expect(createInterface).not.toHaveBeenCalled();
});

test('payment approval consent rejects declined prompts before retrying with approval', async () => {
  setStdinIsTty(true);
  question.mockResolvedValueOnce('no');
  const runWithApproval = vi.fn(async (): Promise<string> => 'approved');

  await expect(runWithPaymentApprovalConsent({
    commandName: 'rare auction bid',
    approvalMessage: 'ERC20 approval is required before placing this bid.',
    runWithoutApproval: async () => {
      throw new PaymentApprovalRequiredError({ requiredAmount: 5n, spenderAddress });
    },
    runWithApproval,
  })).rejects.toThrow('Aborted.');

  expect(runWithApproval).not.toHaveBeenCalled();
  expect(createInterface).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
});

test('NFT approval consent rejects non-interactive prompts before retrying with approval', async () => {
  setStdinIsTty(false);
  const runWithApproval = vi.fn(async (): Promise<string> => 'approved');

  await expect(runWithNftApprovalConsent({
    commandName: 'rare listing create',
    approvalMessage: 'NFT approval is required before creating this listing.',
    runWithoutApproval: async () => {
      throw new NftApprovalRequiredError({ nftAddress, operator: spenderAddress });
    },
    runWithApproval,
  })).rejects.toThrow('rare listing create requires --yes when an NFT approval is required in non-interactive mode.');

  expect(runWithApproval).not.toHaveBeenCalled();
  expect(createInterface).not.toHaveBeenCalled();
});

test('NFT approval consent rejects declined prompts before retrying with approval', async () => {
  setStdinIsTty(true);
  question.mockResolvedValueOnce('n');
  const runWithApproval = vi.fn(async (): Promise<string> => 'approved');

  await expect(runWithNftApprovalConsent({
    commandName: 'rare listing create',
    approvalMessage: 'NFT approval is required before creating this listing.',
    runWithoutApproval: async () => {
      throw new NftApprovalRequiredError({ nftAddress, operator: spenderAddress });
    },
    runWithApproval,
  })).rejects.toThrow('Aborted.');

  expect(runWithApproval).not.toHaveBeenCalled();
  expect(createInterface).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
});

test('minter approval consent retries with approval after confirmation', async () => {
  setStdinIsTty(true);
  question.mockResolvedValueOnce('yes');
  const runWithApproval = vi.fn(async (): Promise<string> => 'approved');

  await expect(runWithMinterApprovalConsent({
    commandName: 'rare listing release configure',
    approvalMessage: 'RareMinter minter approval is required before configuring this release.',
    runWithoutApproval: async () => {
      throw new MinterApprovalRequiredError({ collection: collectionAddress, minter: spenderAddress });
    },
    runWithApproval,
  })).resolves.toBe('approved');

  expect(runWithApproval).toHaveBeenCalledOnce();
  expect(createInterface).toHaveBeenCalledOnce();
  expect(close).toHaveBeenCalledOnce();
});

test('minter approval consent rejects non-interactive prompts before retrying with approval', async () => {
  setStdinIsTty(false);
  const runWithApproval = vi.fn(async (): Promise<string> => 'approved');

  await expect(runWithMinterApprovalConsent({
    commandName: 'rare listing release configure',
    approvalMessage: 'RareMinter minter approval is required before configuring this release.',
    runWithoutApproval: async () => {
      throw new MinterApprovalRequiredError({ collection: collectionAddress, minter: spenderAddress });
    },
    runWithApproval,
  })).rejects.toThrow('rare listing release configure requires --yes when a minter approval is required in non-interactive mode.');

  expect(runWithApproval).not.toHaveBeenCalled();
  expect(createInterface).not.toHaveBeenCalled();
});

function setStdinIsTty(value: boolean): void {
  Object.defineProperty(process.stdin, 'isTTY', {
    configurable: true,
    value,
  });
}

function restoreStdinIsTty(): void {
  if (originalStdinIsTty === undefined) {
    Reflect.deleteProperty(process.stdin, 'isTTY');
    return;
  }

  Object.defineProperty(process.stdin, 'isTTY', originalStdinIsTty);
}
