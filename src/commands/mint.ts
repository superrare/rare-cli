import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { Command } from 'commander';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { uploadMedia, pinMetadata, type NftAttribute } from '../sdk/api.js';
import { createRareClient } from '../sdk/client.js';
import { printError } from '../errors.js';
import { output, log } from '../output.js';

function parseAttribute(raw: string): NftAttribute {
  if (raw.startsWith('{')) {
    const parsed = JSON.parse(raw);
    if (parsed.value === undefined) {
      throw new Error(`Attribute JSON must include "value": ${raw}`);
    }
    return parsed as NftAttribute;
  }

  const eqIndex = raw.indexOf('=');
  if (eqIndex === -1) {
    return { value: raw };
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
    .option('--tag <tag>', 'tag (repeatable)', (val: string, acc: string[]) => [...acc, val], [] as string[])
    .option('--attribute <attr>', 'attribute as "trait=value" or JSON (repeatable)', (val: string, acc: string[]) => [...acc, val], [] as string[])
    .option('--to <address>', 'recipient address (defaults to caller)')
    .option('--royalty-receiver <address>', 'royalty receiver address (defaults to caller)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (opts) => {
      let tokenUri: string;

      try {
        if (opts.tokenUri) {
          tokenUri = opts.tokenUri;
        } else {
          if (!opts.name) {
            console.error('Error: --name is required when not using --token-uri');
            process.exit(1);
          }
          if (!opts.description) {
            console.error('Error: --description is required when not using --token-uri');
            process.exit(1);
          }
          if (!opts.image) {
            console.error('Error: --image is required when not using --token-uri');
            process.exit(1);
          }

          let imageBuffer: Buffer;
          try {
            imageBuffer = await readFile(opts.image);
          } catch {
            throw new Error(`Could not read image file: ${opts.image}`);
          }
          log(`Uploading image: ${basename(opts.image)} (${imageBuffer.byteLength} bytes)`);
          const imageMedia = await uploadMedia(new Uint8Array(imageBuffer), basename(opts.image));
          log(`  Image uploaded: ${imageMedia.url}`);

          let videoMedia;
          if (opts.video) {
            let videoBuffer: Buffer;
            try {
              videoBuffer = await readFile(opts.video);
            } catch {
              throw new Error(`Could not read video file: ${opts.video}`);
            }
            log(`Uploading video: ${basename(opts.video)} (${videoBuffer.byteLength} bytes)`);
            videoMedia = await uploadMedia(new Uint8Array(videoBuffer), basename(opts.video));
            log(`  Video uploaded: ${videoMedia.url}`);
          }

          const tags: string[] | undefined = opts.tag.length > 0 ? opts.tag : undefined;
          const attributes: NftAttribute[] | undefined =
            opts.attribute.length > 0 ? opts.attribute.map(parseAttribute) : undefined;

          tokenUri = await pinMetadata({
            name: opts.name,
            description: opts.description,
            image: imageMedia,
            video: videoMedia,
            tags,
            attributes,
          });
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
        printError(error);
      }
    });

  return cmd;
}
