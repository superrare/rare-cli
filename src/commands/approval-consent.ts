import { createInterface } from 'node:readline/promises';
import { MinterApprovalRequiredError, NftApprovalRequiredError } from '../sdk/approvals-shell.js';
import { PaymentApprovalRequiredError } from '../sdk/payments-shell.js';
import { isJsonMode, log } from '../output.js';

export async function runWithPaymentApprovalConsent<Result>(params: {
  commandName: string;
  approvalMessage: string;
  runWithoutApproval: () => Promise<Result>;
  runWithApproval: () => Promise<Result>;
}): Promise<Result | undefined> {
  try {
    return await params.runWithoutApproval();
  } catch (error) {
    if (!(error instanceof PaymentApprovalRequiredError)) {
      throw error;
    }
    if (isJsonMode()) {
      throw new Error(`${params.commandName} requires --yes when an ERC20 approval is required.`);
    }

    log(params.approvalMessage);
    log(`  Spender: ${error.spenderAddress}`);
    log(`  Required payment: ${error.requiredAmount.toString()} raw units`);
    if (!process.stdin.isTTY) {
      throw new Error(`${params.commandName} requires --yes when an ERC20 approval is required in non-interactive mode.`);
    }
    if (!(await confirmApproval())) {
      throw new Error('Aborted.');
    }

    return params.runWithApproval();
  }
}

export async function runWithNftApprovalConsent<Result>(params: {
  commandName: string;
  approvalMessage: string;
  runWithoutApproval: () => Promise<Result>;
  runWithApproval: () => Promise<Result>;
}): Promise<Result | undefined> {
  try {
    return await params.runWithoutApproval();
  } catch (error) {
    if (!(error instanceof NftApprovalRequiredError)) {
      throw error;
    }
    if (isJsonMode()) {
      throw new Error(`${params.commandName} requires --yes when an NFT approval is required.`);
    }

    log(params.approvalMessage);
    log(`  NFT contract: ${error.nftAddress}`);
    log(`  Operator: ${error.operator}`);
    if (!process.stdin.isTTY) {
      throw new Error(`${params.commandName} requires --yes when an NFT approval is required in non-interactive mode.`);
    }
    if (!(await confirmApproval())) {
      throw new Error('Aborted.');
    }

    return params.runWithApproval();
  }
}

export async function runWithMinterApprovalConsent<Result>(params: {
  commandName: string;
  approvalMessage: string;
  runWithoutApproval: () => Promise<Result>;
  runWithApproval: () => Promise<Result>;
}): Promise<Result | undefined> {
  try {
    return await params.runWithoutApproval();
  } catch (error) {
    if (!(error instanceof MinterApprovalRequiredError)) {
      throw error;
    }
    if (isJsonMode()) {
      throw new Error(`${params.commandName} requires --yes when a minter approval is required.`);
    }

    log(params.approvalMessage);
    log(`  Collection: ${error.collection}`);
    log(`  Minter: ${error.minter}`);
    if (!process.stdin.isTTY) {
      throw new Error(`${params.commandName} requires --yes when a minter approval is required in non-interactive mode.`);
    }
    if (!(await confirmApproval())) {
      throw new Error('Aborted.');
    }

    return params.runWithApproval();
  }
}

async function confirmApproval(): Promise<boolean> {
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const normalized = (await rl.question('Proceed? [y/N] ')).trim().toLowerCase();
    return normalized === 'y' || normalized === 'yes';
  } finally {
    rl.close();
  }
}
