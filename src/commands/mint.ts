import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { Command } from 'commander';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { uploadMedia, pinMetadata, type NftAttribute, type NftMediaEntry } from '../sdk/api.js';
import { createRareClient } from '../sdk/client.js';
import { parseAddress, parseOptionalAddress } from '../sdk/validation.js';
import { printError } from '../errors.js';
import { output, log } from '../output.js';

type MintOptions = {
  contract: string;
  tokenUri?: string;
  name?: string;
  description?: string;
  image?: string;
  video?: string;
  tag: string[];
  attribute: string[];
  to?: string;
  royaltyReceiver?: string;
  chain?: string;
};

function parseAttribute(raw: string): NftAttribute {
  if (raw.startsWith('{')) {
    const parsed: unknown = JSON.parse(raw);
    if (!isNftAttribute(parsed)) {
      throw new Error(`Attribute JSON must include "value": ${raw}`);
    }
    return parsed;
  }

  const eqIndex = raw.indexOf('=');
  if (eqIndex === -1) {
    return { trait_type: 'value', value: raw };
  }

  const trait_type = raw.slice(0, eqIndex);
  const rawValue = raw.slice(eqIndex + 1);

  const numValue = Number(rawValue);
  const value = rawValue.length > 0 && !Number.isNaN(numValue) ? numValue : rawValue;

  return { trait_type, value };
}

export function mintCommand(): Command {
  const cmd = new Command('mint');
  cmd.description('Mint a new NFT on a deployed token contract');

  cmd
    .requiredOption('--contract <address>', 'token contract address')
    .option('--token-uri <uri>', 'token metadata URI (skip upload if provided)')
    .option('--name <name>', 'NFT name')
    .option('--description <description>', 'NFT description')
    .option('--image <path>', 'path to image file')
    .option('--video <path>', 'path to video file')
    .option('--tag <tag>', 'tag (repeatable)', (val: string, acc: string[]): string[] => [...acc, val], [])
    .option('--attribute <attr>', 'attribute as "trait=value" or JSON (repeatable)', (val: string, acc: string[]): string[] => [...acc, val], [])
    .option('--to <address>', 'recipient address (defaults to caller)')
    .option('--royalty-receiver <address>', 'royalty receiver address (defaults to caller)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts: MintOptions): Promise<void> => {
      try {
        const tokenUri = await resolveTokenUri(opts);
        const chain = getActiveChain(opts.chain);
        const { client, account } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });
        const contractAddress = parseAddress(opts.contract, '--contract');
        const to = parseOptionalAddress(opts.to, '--to');
        const royaltyReceiver = parseOptionalAddress(opts.royaltyReceiver, '--royalty-receiver');

        log(`\nMinting NFT on ${chain}...`);
        log(`  Contract: ${contractAddress}`);
        log(`  URI: ${tokenUri}`);
        if (opts.to || opts.royaltyReceiver) {
          const receiver = to ?? account.address;
          const resolvedRoyaltyReceiver = royaltyReceiver ?? account.address;
          log(`  To: ${receiver}`);
          log(`  Royalty receiver: ${resolvedRoyaltyReceiver}`);
        }

        log('Waiting for confirmation...');
        const result = await rare.mint.mintTo({
          contract: contractAddress,
          tokenUri,
          to,
          royaltyReceiver,
        });

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            tokenId: result.tokenId.toString(),
            contract: contractAddress,
            tokenUri,
          },
          () => {
            console.log(`Transaction sent: ${result.txHash}`);
            console.log(`\nNFT minted! Token ID: ${result.tokenId}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

async function resolveTokenUri(opts: MintOptions): Promise<string> {
  if (opts.tokenUri) {
    return opts.tokenUri;
  }

  const { name, description, image } = requireMetadataOptions(opts);
  const imageMedia = await uploadFileMedia(image, 'image');
  const videoMedia = opts.video ? await uploadFileMedia(opts.video, 'video') : undefined;
  const tags = opts.tag.length > 0 ? opts.tag : undefined;
  const attributes = opts.attribute.length > 0 ? opts.attribute.map(parseAttribute) : undefined;

  return pinMetadata({
    name,
    description,
    image: imageMedia,
    video: videoMedia,
    tags,
    attributes,
  });
}

function requireMetadataOptions(opts: MintOptions): { name: string; description: string; image: string } {
  if (!opts.name) {
    throw new Error('--name is required when not using --token-uri');
  }
  if (!opts.description) {
    throw new Error('--description is required when not using --token-uri');
  }
  if (!opts.image) {
    throw new Error('--image is required when not using --token-uri');
  }

  return { name: opts.name, description: opts.description, image: opts.image };
}

async function uploadFileMedia(filePath: string, label: 'image' | 'video'): Promise<NftMediaEntry> {
  const fileBuffer = await readFileOrThrow(filePath, label);
  const filename = basename(filePath);

  log(`Uploading ${label}: ${filename} (${fileBuffer.byteLength} bytes)`);
  const media = await uploadMedia(new Uint8Array(fileBuffer), filename);
  log(`  ${label[0].toUpperCase()}${label.slice(1)} uploaded: ${media.url}`);

  return media;
}

async function readFileOrThrow(filePath: string, label: string): Promise<Buffer> {
  try {
    return await readFile(filePath);
  } catch {
    throw new Error(`Could not read ${label} file: ${filePath}`);
  }
}

function isNftAttribute(value: unknown): value is NftAttribute {
  if (!isRecord(value) || !isAttributeValue(value.value)) {
    return false;
  }

  return (
    typeof value.trait_type === 'string' &&
    (value.display_type === undefined || isDisplayType(value.display_type)) &&
    (value.max_value === undefined || typeof value.max_value === 'number')
  );
}

function isAttributeValue(value: unknown): value is NftAttribute['value'] {
  return typeof value === 'string' || typeof value === 'number';
}

function isDisplayType(value: unknown): value is NonNullable<NftAttribute['display_type']> {
  return value === 'number' || value === 'boost_number' || value === 'boost_percentage' || value === 'date';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
