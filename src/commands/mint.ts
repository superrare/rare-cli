import { Command } from 'commander';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { tokenAbi } from '../contracts/abis/token.js';
import { uploadMedia, pinMetadata, type NftAttribute } from '../ipfs.js';

function parseAttribute(raw: string): NftAttribute {
  // Try JSON first: --attribute '{"trait_type":"Power","value":40,"display_type":"boost_number"}'
  if (raw.startsWith('{')) {
    const parsed = JSON.parse(raw);
    if (parsed.value === undefined) {
      throw new Error(`Attribute JSON must include "value": ${raw}`);
    }
    return parsed as NftAttribute;
  }

  // Simple shorthand: --attribute "Base=Starfish"
  const eqIndex = raw.indexOf('=');
  if (eqIndex === -1) {
    // Value-only attribute (no trait_type)
    return { value: raw };
  }

  const trait_type = raw.slice(0, eqIndex);
  const rawValue = raw.slice(eqIndex + 1);

  // Try to parse as number for numeric traits
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

      if (opts.tokenUri) {
        tokenUri = opts.tokenUri;
      } else {
        // Build metadata via upload flow
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

        const imageMedia = await uploadMedia(opts.image, 'image');
        const videoMedia = opts.video ? await uploadMedia(opts.video, 'video') : undefined;

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
      const contractAddress = opts.contract as `0x${string}`;
      const useMintTo = opts.to || opts.royaltyReceiver;

      console.log(`\nMinting NFT on ${chain}...`);
      console.log(`  Contract: ${contractAddress}`);
      console.log(`  URI: ${tokenUri}`);

      let txHash: `0x${string}`;

      if (useMintTo) {
        const receiver = (opts.to ?? account.address) as `0x${string}`;
        const royaltyReceiver = (opts.royaltyReceiver ?? account.address) as `0x${string}`;
        console.log(`  To: ${receiver}`);
        console.log(`  Royalty receiver: ${royaltyReceiver}`);
        txHash = await client.writeContract({
          address: contractAddress,
          abi: tokenAbi,
          functionName: 'mintTo',
          args: [tokenUri, receiver, royaltyReceiver],
          account,
          chain: undefined,
        });
      } else {
        txHash = await client.writeContract({
          address: contractAddress,
          abi: tokenAbi,
          functionName: 'addNewToken',
          args: [tokenUri],
          account,
          chain: undefined,
        });
      }

      console.log(`Transaction sent: ${txHash}`);
      console.log('Waiting for confirmation...');

      const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

      const { parseEventLogs } = await import('viem');
      const logs = parseEventLogs({
        abi: tokenAbi,
        logs: receipt.logs,
        eventName: 'Transfer',
      });

      if (logs.length > 0) {
        console.log(`\nNFT minted! Token ID: ${logs[0].args.tokenId}`);
      } else {
        console.log(`\nTransaction confirmed. Block: ${receipt.blockNumber}`);
      }
    });

  return cmd;
}
