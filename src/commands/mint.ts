import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { Command } from 'commander';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { pinMetadata, uploadMedia, type NftMediaEntry } from '../sdk/api.js';
import { createRareClient } from '../sdk/client.js';
import {
  buildMintPinMetadataParams,
  planMintTokenUri,
  type MintGeneratedMetadataPlan,
  type MintMetadataUploadRole,
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
        const tokenUriPlan = planMintTokenUri({
          tokenUri: opts.tokenUri,
          name: opts.name,
          description: opts.description,
          image: opts.image,
          video: opts.video,
          tags: opts.tag,
          attributes: opts.attribute,
        });
        const tokenUri = tokenUriPlan.mode === 'provided'
          ? tokenUriPlan.tokenUri
          : await uploadAndPinMetadata(tokenUriPlan.metadata);

        const chain = getActiveChain(opts.chain);
        const publicClient = getPublicClient(chain);
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

async function uploadAndPinMetadata(plan: MintGeneratedMetadataPlan): Promise<string> {
  const imageUpload = plan.uploads.find((upload) => upload.role === 'image');
  if (imageUpload === undefined) {
    throw new Error('Image upload was not planned.');
  }

  const videoUpload = plan.uploads.find((upload) => upload.role === 'video');
  const image = await uploadMetadataMedia(imageUpload);
  const video = videoUpload === undefined ? undefined : await uploadMetadataMedia(videoUpload);

  return pinMetadata(buildMintPinMetadataParams(plan, {
    image,
    video,
  }));
}

async function uploadMetadataMedia(upload: { role: MintMetadataUploadRole; path: string }): Promise<NftMediaEntry> {
  const buffer = await readFileOrThrow(upload.path, upload.role);
  const filename = basename(upload.path);
  const label = upload.role === 'image' ? 'Image' : 'Video';
  log(`Uploading ${upload.role}: ${filename} (${buffer.byteLength} bytes)`);
  const media = await uploadMedia(new Uint8Array(buffer), filename);
  log(`  ${label} uploaded: ${media.url}`);
  return media;
}

async function readFileOrThrow(path: string, role: MintMetadataUploadRole): Promise<Buffer> {
  try {
    return await readFile(path);
  } catch {
    throw new Error(`Could not read ${role} file: ${path}`);
  }
}
