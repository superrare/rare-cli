import { readFile, writeFile } from 'node:fs/promises';
import { Command } from 'commander';
import { getAddress, isAddress, type Address, type Hex } from 'viem';
import { getPublicClient, getWalletClient } from '../client.js';
import { getActiveChain } from '../config.js';
import { requireContractAddress, type SupportedChain } from '../contracts/addresses.js';
import { printError } from '../errors.js';
import { output, log } from '../output.js';
import { createRareClient } from '../sdk/client.js';
import type { RareClient } from '../sdk/types.js';
import {
  normalizeBytes32,
  getReleaseAllowlistProof,
  parseReleaseAllowlistArtifactOrBuild,
  verifyReleaseAllowlistProof,
  type ReleaseAllowlistArtifact,
  type ReleaseAllowlistInputFormat,
} from '../sdk/release-core.js';

type ReleaseCommandClient = {
  chain: SupportedChain;
  rare: RareClient;
};

type AllowlistInputOptions = {
  input: string;
  format?: string;
  output?: string;
};

type AllowlistProofOptions = AllowlistInputOptions & {
  address: string;
};

type AllowlistVerifyOptions = AllowlistProofOptions & {
  root?: string;
};

type AllowlistSetOptions = {
  contract: string;
  root?: string;
  input?: string;
  endTimestamp: string;
  format?: string;
  chain?: string;
};

type ReleaseStatusOptions = {
  contract: string;
  account?: string;
  chain?: string;
};

type ReleaseLimitOptions = {
  contract: string;
  limit: string;
  chain?: string;
};

type ReleaseSellerStakingOptions = {
  contract: string;
  minimum: string;
  endTimestamp: string;
  chain?: string;
};

function createAllowlistBuildCommand(): Command {
  const cmd = new Command('build');
  cmd.description('Build a RareMinter allowlist Merkle artifact from CSV or JSON');

  cmd
    .requiredOption('--input <path>', 'CSV or JSON wallet input file')
    .option('--format <format>', 'input format (csv, json)')
    .option('--output <path>', 'write the generated artifact JSON to a file')
    .action(async (opts: AllowlistInputOptions) => {
      try {
        const artifact = await readAllowlistArtifact(opts.input, opts.format);
        if (opts.output !== undefined) {
          await writeJson(opts.output, artifact);
        }

        output(
          opts.output === undefined ? artifact : {
            root: artifact.root,
            count: artifact.count,
            output: opts.output,
          },
          () => {
            console.log(`Allowlist root: ${artifact.root}`);
            console.log(`Wallets: ${artifact.count}`);
            if (opts.output !== undefined) {
              console.log(`Artifact written to: ${opts.output}`);
            }
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function createAllowlistProofCommand(): Command {
  const cmd = new Command('proof');
  cmd.description('Generate a RareMinter allowlist proof for one address');

  cmd
    .requiredOption('--input <path>', 'allowlist artifact, CSV, or JSON wallet input file')
    .requiredOption('--address <address>', 'wallet address to prove')
    .option('--format <format>', 'input format (csv, json)')
    .option('--output <path>', 'write the proof JSON to a file')
    .action(async (opts: AllowlistProofOptions) => {
      try {
        const address = parseAddressOption(opts.address, '--address');
        const artifact = await readAllowlistArtifact(opts.input, opts.format);
        const proof = getReleaseAllowlistProof(artifact, address);

        if (opts.output !== undefined) {
          await writeJson(opts.output, proof);
        }

        output(
          opts.output === undefined ? proof : {
            root: proof.root,
            address: proof.address,
            proofLength: proof.proof.length,
            valid: proof.valid,
            output: opts.output,
          },
          () => {
            console.log(`Allowlist root: ${proof.root}`);
            console.log(`Address: ${proof.address}`);
            console.log(`Proof entries: ${proof.proof.length}`);
            console.log(`Valid: ${proof.valid ? 'yes' : 'no'}`);
            if (opts.output !== undefined) {
              console.log(`Proof written to: ${opts.output}`);
            }
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function createAllowlistVerifyCommand(): Command {
  const cmd = new Command('verify');
  cmd.description('Verify an address proof from an allowlist artifact or wallet file');

  cmd
    .requiredOption('--input <path>', 'allowlist artifact, CSV, or JSON wallet input file')
    .requiredOption('--address <address>', 'wallet address to verify')
    .option('--root <bytes32>', 'expected Merkle root; defaults to the input root')
    .option('--format <format>', 'input format (csv, json)')
    .action(async (opts: AllowlistVerifyOptions) => {
      try {
        const address = parseAddressOption(opts.address, '--address');
        const root = opts.root === undefined ? undefined : normalizeBytes32(opts.root, '--root');
        const artifact = await readAllowlistArtifact(opts.input, opts.format);
        const proof = getReleaseAllowlistProof(artifact, address);
        const valid = verifyReleaseAllowlistProof({
          root: root ?? proof.root,
          address,
          proof: proof.proof,
        });

        output(
          {
            root: root ?? proof.root,
            address: proof.address,
            valid,
          },
          () => {
            console.log(`Allowlist root: ${root ?? proof.root}`);
            console.log(`Address: ${proof.address}`);
            console.log(`Valid: ${valid ? 'yes' : 'no'}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function createAllowlistSetCommand(): Command {
  const cmd = new Command('set');
  cmd.description('Set RareMinter allowlist root and end timestamp for a release collection');

  cmd
    .requiredOption('--contract <address>', 'release collection contract address')
    .option('--root <bytes32>', 'allowlist Merkle root')
    .option('--input <path>', 'allowlist artifact, CSV, or JSON wallet input file')
    .requiredOption('--end-timestamp <seconds>', 'unix timestamp when the allowlist expires')
    .option('--format <format>', 'input format (csv, json)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: AllowlistSetOptions) => {
      try {
        const contract = parseAddressOption(opts.contract, '--contract');
        const root = await resolveAllowlistRoot(opts);
        const { chain, rare } = createWriteReleaseClient(opts.chain);
        const minterAddress = requireContractAddress(chain, 'rareMinter');

        log(`Setting RareMinter allowlist on ${chain}...`);
        log(`  Contract: ${contract}`);
        log(`  RareMinter: ${minterAddress}`);
        log(`  Root: ${root}`);
        log(`  End timestamp: ${opts.endTimestamp}`);
        log('Waiting for confirmation...');

        const result = await rare.release.setAllowlistConfig({
          contract,
          root,
          endTimestamp: opts.endTimestamp,
        });

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            contract: result.contract,
            minter: result.minter,
            root: result.root,
            endTimestamp: result.endTimestamp,
          },
          () => {
            console.log(`Transaction sent: ${result.txHash}`);
            console.log(`Allowlist root set to: ${result.root}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function createAllowlistCommand(): Command {
  const cmd = new Command('allowlist');
  cmd.description('Build, prove, verify, and configure RareMinter allowlists');
  cmd.addCommand(createAllowlistBuildCommand());
  cmd.addCommand(createAllowlistProofCommand());
  cmd.addCommand(createAllowlistVerifyCommand());
  cmd.addCommand(createAllowlistSetCommand());
  return cmd;
}

function createStatusCommand(): Command {
  const cmd = new Command('status');
  cmd.description('Read RareMinter release configuration for a collection');

  cmd
    .requiredOption('--contract <address>', 'release collection contract address')
    .option('--account <address>', 'optional account for mint and transaction usage reads')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: ReleaseStatusOptions) => {
      try {
        const contract = parseAddressOption(opts.contract, '--contract');
        const account = opts.account === undefined ? undefined : parseAddressOption(opts.account, '--account');
        const { chain, rare } = createReadReleaseClient(opts.chain);
        const result = await rare.release.getConfig({ contract, account });

        output(
          {
            chain,
            contract: result.contract,
            minter: result.minter,
            allowlistRoot: result.allowlistRoot,
            allowlistEndTimestamp: result.allowlistEndTimestamp,
            mintLimit: result.mintLimit,
            txLimit: result.txLimit,
            sellerStakingMinimum: result.sellerStakingMinimum,
            sellerStakingMinimumEndTimestamp: result.sellerStakingMinimumEndTimestamp,
            account: result.account,
            accountMints: result.accountMints,
            accountTxs: result.accountTxs,
          },
          () => {
            console.log(`RareMinter: ${result.minter}`);
            console.log(`Allowlist root: ${result.allowlistRoot}`);
            console.log(`Allowlist end timestamp: ${result.allowlistEndTimestamp.toString()}`);
            console.log(`Mint limit: ${result.mintLimit.toString()}`);
            console.log(`Transaction limit: ${result.txLimit.toString()}`);
            console.log(`Seller staking minimum: ${result.sellerStakingMinimum.toString()}`);
            console.log(`Seller staking minimum end timestamp: ${result.sellerStakingMinimumEndTimestamp.toString()}`);
            if (result.account !== undefined) {
              console.log(`Account: ${result.account}`);
              console.log(`Account mints: ${result.accountMints?.toString() ?? '0'}`);
              console.log(`Account transactions: ${result.accountTxs?.toString() ?? '0'}`);
            }
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function createSetMintLimitCommand(): Command {
  const cmd = new Command('set-mint');
  cmd.description('Set the per-wallet mint limit for a RareMinter release');

  cmd
    .requiredOption('--contract <address>', 'release collection contract address')
    .requiredOption('--limit <number>', 'per-wallet mint limit; 0 disables the limit')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: ReleaseLimitOptions) => setReleaseLimit('mint', opts));

  return cmd;
}

function createSetTxLimitCommand(): Command {
  const cmd = new Command('set-tx');
  cmd.description('Set the per-wallet transaction limit for a RareMinter release');

  cmd
    .requiredOption('--contract <address>', 'release collection contract address')
    .requiredOption('--limit <number>', 'per-wallet transaction limit; 0 disables the limit')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: ReleaseLimitOptions) => setReleaseLimit('tx', opts));

  return cmd;
}

function createLimitsCommand(): Command {
  const cmd = new Command('limits');
  cmd.description('Configure RareMinter mint and transaction limits');
  cmd.addCommand(createSetMintLimitCommand());
  cmd.addCommand(createSetTxLimitCommand());
  return cmd;
}

function createSetSellerStakingMinimumCommand(): Command {
  const cmd = new Command('set-minimum');
  cmd.description('Set the seller staking minimum for a RareMinter release');

  cmd
    .requiredOption('--contract <address>', 'release collection contract address')
    .requiredOption('--minimum <raw>', 'minimum staked amount in raw token units; 0 disables the minimum')
    .requiredOption('--end-timestamp <seconds>', 'unix timestamp when the minimum expires')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: ReleaseSellerStakingOptions) => {
      try {
        const contract = parseAddressOption(opts.contract, '--contract');
        const { chain, rare } = createWriteReleaseClient(opts.chain);
        const minterAddress = requireContractAddress(chain, 'rareMinter');

        log(`Setting RareMinter seller staking minimum on ${chain}...`);
        log(`  Contract: ${contract}`);
        log(`  RareMinter: ${minterAddress}`);
        log(`  Minimum: ${opts.minimum}`);
        log(`  End timestamp: ${opts.endTimestamp}`);
        log('Waiting for confirmation...');

        const result = await rare.release.setSellerStakingMinimum({
          contract,
          minimum: opts.minimum,
          endTimestamp: opts.endTimestamp,
        });

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            contract: result.contract,
            minter: result.minter,
            minimum: result.minimum,
            endTimestamp: result.endTimestamp,
          },
          () => {
            console.log(`Transaction sent: ${result.txHash}`);
            console.log(`Seller staking minimum set to: ${result.minimum.toString()}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

function createStakingCommand(): Command {
  const cmd = new Command('staking');
  cmd.description('Configure RareMinter seller staking requirements');
  cmd.addCommand(createSetSellerStakingMinimumCommand());
  return cmd;
}

export function releaseCommand(): Command {
  const cmd = new Command('release');
  cmd.description('Configure and inspect RareMinter release settings');
  cmd.addCommand(createAllowlistCommand());
  cmd.addCommand(createStatusCommand());
  cmd.addCommand(createLimitsCommand());
  cmd.addCommand(createStakingCommand());
  return cmd;
}

async function setReleaseLimit(kind: 'mint' | 'tx', opts: ReleaseLimitOptions): Promise<void> {
  try {
    const contract = parseAddressOption(opts.contract, '--contract');
    const { chain, rare } = createWriteReleaseClient(opts.chain);
    const minterAddress = requireContractAddress(chain, 'rareMinter');
    const methodLabel = kind === 'mint' ? 'mint' : 'transaction';

    log(`Setting RareMinter ${methodLabel} limit on ${chain}...`);
    log(`  Contract: ${contract}`);
    log(`  RareMinter: ${minterAddress}`);
    log(`  Limit: ${opts.limit}`);
    log('Waiting for confirmation...');

    const result = kind === 'mint'
      ? await rare.release.setMintLimit({ contract, limit: opts.limit })
      : await rare.release.setTxLimit({ contract, limit: opts.limit });

    output(
      {
        txHash: result.txHash,
        blockNumber: result.receipt.blockNumber.toString(),
        contract: result.contract,
        minter: result.minter,
        limit: result.limit,
      },
      () => {
        console.log(`Transaction sent: ${result.txHash}`);
        console.log(`${methodLabel[0].toUpperCase()}${methodLabel.slice(1)} limit set to: ${result.limit.toString()}`);
      },
    );
  } catch (error) {
    printError(error);
  }
}

async function readAllowlistArtifact(
  inputPath: string,
  rawFormat: string | undefined,
): Promise<ReleaseAllowlistArtifact> {
  const format = parseFormatOption(rawFormat);
  const content = await readFile(inputPath, 'utf8');
  return parseReleaseAllowlistArtifactOrBuild({
    content,
    format,
    sourceName: inputPath,
  });
}

async function resolveAllowlistRoot(opts: AllowlistSetOptions): Promise<Hex> {
  if (opts.root !== undefined && opts.input !== undefined) {
    throw new Error('Pass either --root or --input, not both.');
  }
  if (opts.root !== undefined) {
    return normalizeBytes32(opts.root, '--root');
  }
  if (opts.input !== undefined) {
    return (await readAllowlistArtifact(opts.input, opts.format)).root;
  }
  throw new Error('Pass --root or --input to set an allowlist config.');
}

function createReadReleaseClient(chainInput: string | undefined): ReleaseCommandClient {
  const chain = getActiveChain(chainInput);
  const publicClient = getPublicClient(chain);
  return {
    chain,
    rare: createRareClient({ publicClient }),
  };
}

function createWriteReleaseClient(chainInput: string | undefined): ReleaseCommandClient {
  const chain = getActiveChain(chainInput);
  const { client } = getWalletClient(chain);
  const publicClient = getPublicClient(chain);
  return {
    chain,
    rare: createRareClient({ publicClient, walletClient: client }),
  };
}

function parseFormatOption(value: string | undefined): ReleaseAllowlistInputFormat | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (value === 'csv' || value === 'json') {
    return value;
  }
  throw new Error('--format must be "csv" or "json".');
}

function parseAddressOption(value: string, optionName: string): Address {
  if (!isAddress(value)) {
    throw new Error(`${optionName} must be a valid 0x address.`);
  }

  return getAddress(value);
}

async function writeJson(path: string, data: unknown): Promise<void> {
  await writeFile(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}
