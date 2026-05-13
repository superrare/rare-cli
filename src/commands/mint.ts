import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { Command } from 'commander';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { uploadMedia, pinMetadata, type NftMediaEntry } from '../sdk/api.js';
import { createRareClient } from '../sdk/client.js';
import {
  buildMintPinMetadataParams,
  isMintMetadataOptionsError,
  planMintTokenUri,
  type MintGeneratedMetadataPlan,
  type MintMetadataUploadRole,
} from '../sdk/mint-core.js';
import { printError } from '../errors.js';
import { output, log } from '../output.js';

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
    .option('--tag <tag>', 'tag (repeatable)', (val: string, acc: string[]) => [...acc, val], [] as string[])
    .option('--attribute <attr>', 'attribute as "trait=value" or JSON (repeatable)', (val: string, acc: string[]) => [...acc, val], [] as string[])
    .option('--to <address>', 'recipient address (defaults to caller)')
    .option('--royalty-receiver <address>', 'royalty receiver address (defaults to caller)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts) => {
      let tokenUri: string;

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

        if (tokenUriPlan.mode === 'provided') {
          tokenUri = tokenUriPlan.tokenUri;
        } else {
          tokenUri = await uploadAndPinMetadata(tokenUriPlan.metadata);
        }

        const chain = getActiveChain(opts.chain);
        const { client, account } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });
        const contractAddress = opts.contract as `0x${string}`;

        log(`\nMinting NFT on ${chain}...`);
        log(`  Contract: ${contractAddress}`);
        log(`  URI: ${tokenUri}`);
        if (opts.to || opts.royaltyReceiver) {
          const receiver = (opts.to ?? account.address) as `0x${string}`;
          const royaltyReceiver = (opts.royaltyReceiver ?? account.address) as `0x${string}`;
          log(`  To: ${receiver}`);
          log(`  Royalty receiver: ${royaltyReceiver}`);
        }

        log('Waiting for confirmation...');
        const result = await rare.mint.mintTo({
          contract: contractAddress,
          tokenUri,
          to: opts.to as `0x${string}` | undefined,
          royaltyReceiver: opts.royaltyReceiver as `0x${string}` | undefined,
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
        if (isMintMetadataOptionsError(error)) {
          console.error(`Error: ${error.message}`);
          process.exit(1);
        }
        printError(error);
      }
    });

  return cmd;
}

async function uploadAndPinMetadata(plan: MintGeneratedMetadataPlan): Promise<string> {
  const media: Partial<Record<MintMetadataUploadRole, NftMediaEntry>> = {};

  for (const upload of plan.uploads) {
    const buffer = await readFileOrThrow(upload.path, upload.role);
    const filename = basename(upload.path);
    const label = upload.role === 'image' ? 'Image' : 'Video';
    log(`Uploading ${upload.role}: ${filename} (${buffer.byteLength} bytes)`);
    media[upload.role] = await uploadMedia(new Uint8Array(buffer), filename);
    log(`  ${label} uploaded: ${media[upload.role].url}`);
  }

  if (!media.image) {
    throw new Error('Image upload was not planned.');
  }

  return pinMetadata(buildMintPinMetadataParams(plan, {
    image: media.image,
    video: media.video,
  }));
}

async function readFileOrThrow(path: string, role: MintMetadataUploadRole): Promise<Buffer> {
  try {
    return await readFile(path);
  } catch {
    throw new Error(`Could not read ${role} file: ${path}`);
  }
}
