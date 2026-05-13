import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { Command } from 'commander';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient } from '../client.js';
import type { NftMediaEntry } from '../sdk/api.js';
import { createRareClient } from '../sdk/client.js';
import type { RareClient } from '../sdk/types.js';
import {
  buildMintPinMetadataParams,
  planMintTokenUri,
  type MintGeneratedMetadataPlan,
  type MintMetadataUploadPlan,
} from '../sdk/mint-core.js';
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
        const chain = getActiveChain(opts.chain);
        const publicClient = getPublicClient(chain);
        const mediaClient = createRareClient({ publicClient });
        const tokenUri = await resolveTokenUri(mediaClient, opts);
        const { client, account } = getWalletClient(chain);
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

async function resolveTokenUri(rare: RareClient, opts: MintOptions): Promise<string> {
  const tokenUriPlan = planMintTokenUri({
    tokenUri: opts.tokenUri,
    name: opts.name,
    description: opts.description,
    image: opts.image,
    video: opts.video,
    tags: opts.tag,
    attributes: opts.attribute,
  });
  if (tokenUriPlan.mode === 'provided') {
    return tokenUriPlan.tokenUri;
  }

  return uploadAndPinMetadata(rare, tokenUriPlan.metadata);
}

async function uploadAndPinMetadata(rare: RareClient, plan: MintGeneratedMetadataPlan): Promise<string> {
  const imageUpload = plan.uploads.find((upload) => upload.role === 'image');
  if (imageUpload === undefined) {
    throw new Error('Image upload was not planned.');
  }
  const image = await uploadFileMedia(rare, imageUpload);
  const videoUpload = plan.uploads.find((upload) => upload.role === 'video');
  const video = videoUpload === undefined ? undefined : await uploadFileMedia(rare, videoUpload);

  return rare.media.pinMetadata(buildMintPinMetadataParams(plan, {
    image,
    video,
  }));
}

async function uploadFileMedia(
  rare: RareClient,
  upload: MintMetadataUploadPlan,
): Promise<NftMediaEntry> {
  const fileBuffer = await readFileOrThrow(upload.path, upload.role);
  const filename = basename(upload.path);

  log(`Uploading ${upload.role}: ${filename} (${fileBuffer.byteLength} bytes)`);
  const media = await rare.media.upload(new Uint8Array(fileBuffer), filename);
  const labelCapitalized = `${upload.role.charAt(0).toUpperCase()}${upload.role.slice(1)}`;
  log(`  ${labelCapitalized} uploaded: ${media.url}`);

  return media;
}

async function readFileOrThrow(filePath: string, label: string): Promise<Buffer> {
  try {
    return await readFile(filePath);
  } catch {
    throw new Error(`Could not read ${label} file: ${filePath}`);
  }
}
