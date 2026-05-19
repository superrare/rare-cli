import { createInterface } from 'node:readline/promises';
import { NftApprovalRequiredError, PaymentApprovalRequiredError } from '../sdk/helpers.js';
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
    if (!(await confirmApproval())) {
      console.log('Aborted.');
      return undefined;
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
    if (!(await confirmApproval())) {
      console.log('Aborted.');
      return undefined;
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
