import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { Command } from 'commander';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { createRareClient } from '../sdk/client.js';
import {
  buildCurvePreview,
  parseCurveConfig,
  type LiquidCurvePreview,
  type LiquidCurveSegment,
} from '../liquid/curve-config.js';
import { runLiquidCurveWizard } from '../liquid/wizard.js';
import { output, log } from '../output.js';
import {
  formatCurvePreview,
  isCurvePresetKey,
  parseAttribute,
  parseRarePriceUsdOverride,
  resolveCurveSourceMode,
} from './deploy-core.js';

export { formatCurvePreview, resolveCurveSourceMode } from './deploy-core.js';

async function resolveRarePriceUsd(
  rare: ReturnType<typeof createRareClient>,
  provided?: string,
): Promise<number> {
  if (provided !== undefined) {
    return parseRarePriceUsdOverride(provided)!;
  }

  return (await rare.token.getPrice('RARE')).priceUsd;
}

async function maybeResolveRarePriceUsd(
  rare: ReturnType<typeof createRareClient>,
  provided?: string,
): Promise<number | undefined> {
  if (provided !== undefined) {
    return resolveRarePriceUsd(rare, provided);
  }

  try {
    return (await rare.token.getPrice('RARE')).priceUsd;
  } catch {
    return undefined;
  }
}

async function resolveTokenUri(
  rare: ReturnType<typeof createRareClient>,
  tokenName: string,
  opts: {
    tokenUri?: string;
    description?: string;
    image?: string;
    video?: string;
    tag: string[];
    attribute: string[];
  },
): Promise<string> {
  if (opts.tokenUri) {
    return opts.tokenUri;
  }
  if (!opts.description) {
    throw new Error('--description is required when not using --token-uri');
  }
  if (!opts.image) {
    throw new Error('--image is required when not using --token-uri');
  }

  const imageBuffer = await readFile(opts.image);
  log(`Uploading image: ${basename(opts.image)} (${imageBuffer.byteLength} bytes)`);
  const imageMedia = await rare.media.upload(new Uint8Array(imageBuffer), basename(opts.image));
  log(`  Image uploaded: ${imageMedia.url}`);

  let videoMedia;
  if (opts.video) {
    const videoBuffer = await readFile(opts.video);
    log(`Uploading video: ${basename(opts.video)} (${videoBuffer.byteLength} bytes)`);
    videoMedia = await rare.media.upload(new Uint8Array(videoBuffer), basename(opts.video));
    log(`  Video uploaded: ${videoMedia.url}`);
  }

  const attributes = opts.attribute.length > 0 ? opts.attribute.map(parseAttribute) : undefined;
  const tags = opts.tag.length > 0 ? opts.tag : undefined;

  return rare.media.pinMetadata({
    name: tokenName,
    description: opts.description,
    image: imageMedia,
    video: videoMedia,
    tags,
    attributes,
  });
}

async function writeGeneratedCurves(path: string | undefined, curves: LiquidCurveSegment[]): Promise<void> {
  if (!path) return;
  await writeFile(path, JSON.stringify(curves, null, 2), 'utf-8');
  log(`Wrote generated curves to ${path}`);
}

function printCurvePreview(preview: LiquidCurvePreview, source: string): void {
  for (const line of formatCurvePreview(preview, source)) {
    console.log(line);
  }
}

async function resolveCurves(
  opts: {
    curvesFile?: string;
    curvePreset?: string;
    rarePriceUsd?: string;
    writeCurvesFile?: string;
  },
  rare: ReturnType<typeof createRareClient>,
): Promise<{
  source: string;
  curves: LiquidCurveSegment[];
  preview: LiquidCurvePreview;
  rarePriceUsd?: number;
}> {
  const factoryConfig = await rare.liquid.getFactoryConfig();
  const mode = resolveCurveSourceMode(opts, Boolean(process.stdin.isTTY));

  if (mode === 'file') {
    const raw = await readFile(opts.curvesFile!, 'utf-8');
    const curves = parseCurveConfig(raw, factoryConfig.curvePoolSupplyTokens, factoryConfig.poolTickSpacing);
    const rarePriceUsd = await maybeResolveRarePriceUsd(rare, opts.rarePriceUsd);
    return {
      source: `file:${opts.curvesFile!}`,
      curves,
      preview: buildCurvePreview(curves, factoryConfig, rarePriceUsd),
      rarePriceUsd,
    };
  }

  if (mode === 'preset') {
    if (!isCurvePresetKey(opts.curvePreset!)) {
      throw new Error(`Unsupported curve preset "${opts.curvePreset!}". Use low-demand, medium-demand, or high-demand.`);
    }
    const rarePriceUsd = await resolveRarePriceUsd(rare, opts.rarePriceUsd);
    const curves = await rare.liquid.generatePresetCurves({
      preset: opts.curvePreset!,
      rarePriceUsd,
    });
    await writeGeneratedCurves(opts.writeCurvesFile, curves);
    return {
      source: `preset:${opts.curvePreset!}`,
      curves,
      preview: buildCurvePreview(curves, factoryConfig, rarePriceUsd),
      rarePriceUsd,
    };
  }

  const wizard = await runLiquidCurveWizard({
    factoryConfig,
    rarePriceUsd: parseRarePriceUsdOverride(opts.rarePriceUsd),
    getRarePriceUsd: async () => (await rare.token.getPrice('RARE')).priceUsd,
  });
  await writeGeneratedCurves(opts.writeCurvesFile, wizard.curves);
  return {
    source: `wizard:${wizard.preset}`,
    curves: wizard.curves,
    preview: wizard.preview,
    rarePriceUsd: wizard.rarePriceUsd,
  };
}

function deployErc721Command(): Command {
  const cmd = new Command('erc721');
  cmd.description('Deploy a new ERC-721 NFT contract via the RARE factory');

  cmd
    .argument('<name>', 'name of the NFT collection')
    .argument('<symbol>', 'symbol of the NFT collection')
    .option('--max-tokens <number>', 'maximum number of tokens (optional)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .action(async (name: string, symbol: string, opts: { maxTokens?: string; chain?: string }) => {
      const chain = getActiveChain(opts.chain);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });

      log(`Deploying ERC-721 contract on ${chain}...`);
      log(`  Factory: ${rare.contracts.factory}`);
      log(`  Name: ${name}`);
      log(`  Symbol: ${symbol}`);
      if (opts.maxTokens) log(`  Max tokens: ${opts.maxTokens}`);
      log('Waiting for confirmation...');

      const result = await rare.deploy.erc721({
        name,
        symbol,
        maxTokens: opts.maxTokens,
      });

      output(
        {
          txHash: result.txHash,
          blockNumber: result.receipt.blockNumber.toString(),
          contract: result.contract ?? null,
        },
        () => {
          console.log(`Transaction sent: ${result.txHash}`);
          if (result.contract) {
            console.log(`\nERC-721 contract deployed at: ${result.contract}`);
          } else {
            console.log(`\nTransaction confirmed. Block: ${result.receipt.blockNumber}`);
            console.log('Could not parse deployed address from logs.');
          }
        },
      );
    });

  return cmd;
}

function deployLiquidTokenCommand(): Command {
  const cmd = new Command('liquid-token');
  cmd.description('Deploy a new Liquid Editions token via the liquid factory');

  cmd
    .argument('<name>', 'name of the liquid token')
    .argument('<symbol>', 'symbol of the liquid token')
    .option('--curves-file <path>', 'path to curve JSON')
    .option('--curve-preset <preset>', 'curve preset to generate (low-demand, medium-demand, high-demand)')
    .option('--rare-price-usd <number>', 'override RARE/USD price used for preset generation and preview')
    .option('--write-curves-file <path>', 'write generated curves to a JSON file')
    .option('--initial-rare-liquidity <amount>', 'initial RARE liquidity to seed with')
    .option('--preview', 'preview the resolved curve config without deploying')
    .option('--token-uri <uri>', 'token metadata URI (skip upload if provided)')
    .option('--description <description>', 'description for metadata when uploading')
    .option('--image <path>', 'path to the metadata image')
    .option('--video <path>', 'path to the metadata video')
    .option('--tag <tag>', 'tag (repeatable)', (val: string, acc: string[]) => [...acc, val], [] as string[])
    .option('--attribute <attr>', 'attribute as "trait=value" or JSON (repeatable)', (val: string, acc: string[]) => [...acc, val], [] as string[])
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .action(
      async (
        name: string,
        symbol: string,
        opts: {
          curvesFile?: string;
          curvePreset?: string;
          rarePriceUsd?: string;
          writeCurvesFile?: string;
          initialRareLiquidity?: string;
          preview?: boolean;
          tokenUri?: string;
          description?: string;
          image?: string;
          video?: string;
          tag: string[];
          attribute: string[];
          chain?: string;
        },
      ) => {
        const chain = getActiveChain(opts.chain);
        const { client } = getWalletClient(chain);
        const publicClient = getPublicClient(chain);
        const rare = createRareClient({ publicClient, walletClient: client });

        const curves = await resolveCurves(opts, rare);
        if (opts.preview) {
          output(
            {
              source: curves.source,
              rarePriceUsd: curves.rarePriceUsd ?? null,
              preview: curves.preview,
              curves: curves.curves,
            },
            () => {
              printCurvePreview(curves.preview, curves.source);
            },
          );
          return;
        }

        const tokenUri = await resolveTokenUri(rare, name, opts);
        log(`Deploying liquid token on ${chain}...`);
        log(`  Factory: ${rare.contracts.liquidFactory}`);
        log(`  Name: ${name}`);
        log(`  Symbol: ${symbol}`);
        log(`  Token URI: ${tokenUri}`);
        log(`  Curve source: ${curves.source}`);
        if (opts.initialRareLiquidity) {
          log(`  Initial RARE liquidity: ${opts.initialRareLiquidity}`);
        }
        log('Waiting for confirmation...');

        const result = await rare.liquid.deployMultiCurve({
          name,
          symbol,
          tokenUri,
          initialRareLiquidity: opts.initialRareLiquidity,
          curves: curves.curves,
        });

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            contract: result.contract ?? null,
            tokenUri,
            curves: curves.curves,
            source: curves.source,
            rarePriceUsd: curves.rarePriceUsd ?? null,
          },
          () => {
            console.log(`Transaction sent: ${result.txHash}`);
            if (result.contract) {
              console.log(`\nLiquid token deployed at: ${result.contract}`);
            } else {
              console.log(`\nTransaction confirmed. Block: ${result.receipt.blockNumber}`);
              console.log('Could not parse deployed address from logs.');
            }
          },
        );
      },
    );

  return cmd;
}

export function deployCommand(): Command {
  const cmd = new Command('deploy');
  cmd.description('Deploy a new contract via the RARE protocol');

  cmd.addCommand(deployErc721Command());
  cmd.addCommand(deployLiquidTokenCommand());

  return cmd;
}
