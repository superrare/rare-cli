import { readFile, writeFile } from 'node:fs/promises';
import { basename } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Command } from 'commander';
import { getActiveChain } from '../config.js';
import { getPublicClient, getWalletClient } from '../client.js';
import { createRareClient } from '../sdk/client.js';
import { printError } from '../errors.js';
import {
  parseCurveConfig,
  type LiquidCurvePreview,
  type LiquidCurveSegment,
} from '../liquid/curve-config.js';
import { toPositiveInteger } from '../sdk/amounts-core.js';
import { resolveLiquidFactoryConfigForSupply } from '../liquid/factory-config-core.js';
import { runLiquidCurveWizard } from '../liquid/wizard.js';
import { output, log, isJsonMode } from '../output.js';
import {
  formatLiquidEditionUrl,
  formatCurvePreview,
  getLiquidEditionDeployConfirmationDecision,
  isCurvePresetKey,
  parseAttribute,
  resolveCurveSourceMode,
  validateLiquidEditionDeployMetadataOptions,
} from './deploy-core.js';

export {
  formatCurvePreview,
  formatLiquidEditionUrl,
  getLiquidEditionDeployConfirmationDecision,
  resolveCurveSourceMode,
  validateLiquidEditionDeployMetadataOptions,
} from './deploy-core.js';

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

  const imageBuffer = await readMetadataFile(opts.image, 'image');
  log(`Uploading image: ${basename(opts.image)} (${imageBuffer.byteLength} bytes)`);
  const imageMedia = await rare.media.upload(new Uint8Array(imageBuffer), basename(opts.image));
  log(`  Image uploaded: ${imageMedia.url}`);

  const videoMedia = opts.video ? await uploadVideoMedia(rare, opts.video) : undefined;

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

async function uploadVideoMedia(
  rare: ReturnType<typeof createRareClient>,
  videoPath: string,
): Promise<Awaited<ReturnType<ReturnType<typeof createRareClient>['media']['upload']>>> {
  const videoBuffer = await readMetadataFile(videoPath, 'video');
  log(`Uploading video: ${basename(videoPath)} (${videoBuffer.byteLength} bytes)`);
  const videoMedia = await rare.media.upload(new Uint8Array(videoBuffer), basename(videoPath));
  log(`  Video uploaded: ${videoMedia.url}`);
  return videoMedia;
}

async function preflightTokenUriFiles(opts: {
  tokenUri?: string;
  image?: string;
  video?: string;
}): Promise<void> {
  if (opts.tokenUri !== undefined) {
    return;
  }
  if (opts.image !== undefined) {
    await readMetadataFile(opts.image, 'image');
  }
  if (opts.video !== undefined) {
    await readMetadataFile(opts.video, 'video');
  }
}

async function readMetadataFile(path: string, role: 'image' | 'video'): Promise<Buffer> {
  try {
    return await readFile(path);
  } catch (error) {
    throw new Error(`Could not read ${role} file: ${path}`, { cause: error });
  }
}

async function writeGeneratedCurves(path: string | undefined, curves: LiquidCurveSegment[]): Promise<void> {
  if (!path) return;
  await writeFile(path, JSON.stringify(curves, null, 2), 'utf-8');
  log(`Wrote generated curves to ${path}`);
}

function printCurvePreview(preview: LiquidCurvePreview, source: string, targetChain?: string): void {
  for (const line of formatCurvePreview(preview, source, targetChain)) {
    console.log(line);
  }
}

function collectRepeatedString(value: string, previous: string[]): string[] {
  return [...previous, value];
}

async function confirmLiquidEditionDeploy(chain: string, yes?: boolean): Promise<void> {
  const decision = getLiquidEditionDeployConfirmationDecision({
    yes,
    jsonMode: isJsonMode(),
    stdinIsTty: process.stdin.isTTY,
  });
  if (decision === 'skip') {
    return;
  }
  if (decision === 'reject-json') {
    throw new Error('rare liquid-edition deploy multicurve requires --yes when --json is enabled.');
  }
  if (decision === 'reject-non-interactive') {
    throw new Error('rare liquid-edition deploy multicurve requires --yes in non-interactive mode.');
  }

  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  try {
    const answer = (await rl.question(`Submit liquid edition deployment transaction on ${chain}? [y/N] `)).trim().toLowerCase();
    if (answer === 'y' || answer === 'yes') {
      return;
    }
  } finally {
    rl.close();
  }

  throw new Error('Aborted.');
}

function resolveFactoryConfigForSupplyOrThrow(
  factoryConfig: Awaited<ReturnType<ReturnType<typeof createRareClient>['liquidEdition']['getFactoryConfig']>>,
  totalSupply?: string,
): Awaited<ReturnType<ReturnType<typeof createRareClient>['liquidEdition']['getFactoryConfig']>> {
  const result = resolveLiquidFactoryConfigForSupply(factoryConfig, totalSupply);
  if (!result.isValid) {
    throw new Error(result.errorMessage);
  }
  return result.factoryConfig;
}

async function resolveCurves(
  opts: {
    curvesFile?: string;
    curvePreset?: string;
    writeCurvesFile?: string;
    totalSupply?: string;
    yes?: boolean;
    targetChain?: string;
  },
  rare: ReturnType<typeof createRareClient>,
): Promise<{
  source: string;
  curves: LiquidCurveSegment[];
  preview: LiquidCurvePreview;
  rarePriceUsd?: number;
}> {
  const mode = resolveCurveSourceMode(opts, Boolean(process.stdin.isTTY));

  if (mode === 'file') {
    if (!opts.curvesFile) {
      throw new Error('--curves-file is required for file curve source.');
    }
    const factoryConfig = resolveFactoryConfigForSupplyOrThrow(
      await rare.liquidEdition.getFactoryConfig(),
      opts.totalSupply,
    );
    const raw = await readFile(opts.curvesFile, 'utf-8');
    const curves = parseCurveConfig(raw, factoryConfig.curvePoolSupplyTokens, factoryConfig.poolTickSpacing);
    const preview = await rare.liquidEdition.validateCurves({ curves, totalSupply: opts.totalSupply });
    return {
      source: `file:${opts.curvesFile}`,
      curves,
      preview,
      rarePriceUsd: preview.rarePriceUsd,
    };
  }

  if (mode === 'preset') {
    if (!opts.curvePreset || !isCurvePresetKey(opts.curvePreset)) {
      throw new Error(`Unsupported curve preset "${opts.curvePreset}". Use low-demand, medium-demand, or high-demand.`);
    }
    const generated = await rare.liquidEdition.generatePresetCurves({
      preset: opts.curvePreset,
      totalSupply: opts.totalSupply,
    });
    await writeGeneratedCurves(opts.writeCurvesFile, generated.curves);
    return {
      source: `preset:${opts.curvePreset}`,
      curves: generated.curves,
      preview: generated.preview,
      rarePriceUsd: generated.rarePriceUsd,
    };
  }

  const wizard = await runLiquidCurveWizard({
    skipConfirmation: opts.yes,
    targetChain: opts.targetChain,
    generatePresetCurves: async (preset) => rare.liquidEdition.generatePresetCurves({ preset, totalSupply: opts.totalSupply }),
  });
  await writeGeneratedCurves(opts.writeCurvesFile, wizard.curves);
  return {
    source: `wizard:${wizard.preset}`,
    curves: wizard.curves,
    preview: wizard.preview,
    rarePriceUsd: wizard.rarePriceUsd,
  };
}

export function deployErc721Command(): Command {
  const cmd = new Command('erc721');
  cmd.description('Deploy a new ERC-721 NFT contract via the RARE factory');

  cmd
    .argument('<name>', 'name of the NFT collection')
    .argument('<symbol>', 'symbol of the NFT collection')
    .option('--max-tokens <number>', 'maximum number of tokens (optional)')
    .option('--chain <chain>', 'chain to use (mainnet, sepolia, base, base-sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111, 8453, 84532)')
    .action(async (
      name: string,
      symbol: string,
      opts: { maxTokens?: string; chain?: string; chainId?: string },
    ): Promise<void> => {
      const maxTokens = opts.maxTokens === undefined ? undefined : toPositiveInteger(opts.maxTokens, 'maxTokens');
      const chain = getActiveChain(opts.chain, opts.chainId);
      const { client } = getWalletClient(chain);
      const publicClient = getPublicClient(chain);
      const rare = createRareClient({ publicClient, walletClient: client });

      log(`Deploying ERC-721 contract on ${chain}...`);
      log(`  Factory: ${rare.contracts.factory}`);
      log(`  Name: ${name}`);
      log(`  Symbol: ${symbol}`);
      if (maxTokens !== undefined) log(`  Max tokens: ${maxTokens.toString()}`);
      log('Waiting for confirmation...');

      try {
        const result = await rare.collection.deploy.erc721({
          name,
          symbol,
          maxTokens,
        });

        output(
          {
            txHash: result.txHash,
            blockNumber: result.receipt.blockNumber.toString(),
            contract: result.contract,
          },
          () => {
            console.log(`Transaction sent: ${result.txHash}`);
            console.log(`\nERC-721 contract deployed at: ${result.contract}`);
          },
        );
      } catch (error) {
        printError(error);
      }
    });

  return cmd;
}

export function deployLiquidEditionCommand(): Command {
  const cmd = new Command('multicurve');
  cmd.description('Deploy a new multicurve Liquid Edition via the liquid factory');

  cmd
    .argument('<name>', 'name of the liquid edition')
    .argument('<symbol>', 'symbol of the liquid edition')
    .option('--curves-file <path>', 'path to curve JSON')
    .option('--curve-preset <preset>', 'curve preset to generate (low-demand, medium-demand, high-demand)')
    .option('--write-curves-file <path>', 'write generated curves to a JSON file')
    .option('--initial-rare-liquidity <amount>', 'initial RARE liquidity to seed with')
    .option('--total-supply <amount>', 'custom max total token supply')
    .option('--preview', 'preview the resolved curve config without deploying')
    .option('--yes', 'yes to all prompts, including transaction submission')
    .option('--token-uri <uri>', 'token metadata URI (skip upload if provided)')
    .option('--description <description>', 'description for metadata when uploading')
    .option('--image <path>', 'path to the metadata image')
    .option('--video <path>', 'path to the metadata video')
    .option('--tag <tag>', 'tag (repeatable)', collectRepeatedString, [])
    .option('--attribute <attr>', 'attribute as "trait=value" or JSON (repeatable)', collectRepeatedString, [])
    .option('--chain <chain>', 'chain to use (mainnet, sepolia)')
    .option('--chain-id <id>', 'chain ID (1, 11155111)')
    .action(
      async (
        name: string,
        symbol: string,
        opts: {
          curvesFile?: string;
          curvePreset?: string;
          writeCurvesFile?: string;
          initialRareLiquidity?: string;
          totalSupply?: string;
          preview?: boolean;
          yes?: boolean;
          tokenUri?: string;
          description?: string;
          image?: string;
          video?: string;
          tag: string[];
          attribute: string[];
          chain?: string;
          chainId?: string;
        },
      ) => {
        const metadataValidation = validateLiquidEditionDeployMetadataOptions(opts);
        if (!metadataValidation.isValid) {
          throw new Error(metadataValidation.errorMessage);
        }
        await preflightTokenUriFiles(opts);

        const chain = getActiveChain(opts.chain, opts.chainId);
        const publicClient = getPublicClient(chain);
        const readOnlyRare = createRareClient({ publicClient });

        try {
          const curves = await resolveCurves({ ...opts, targetChain: chain }, readOnlyRare);
          if (opts.preview) {
            output(
              {
                chain,
                source: curves.source,
                rarePriceUsd: curves.rarePriceUsd ?? null,
                preview: curves.preview,
                curves: curves.curves,
              },
              () => {
                printCurvePreview(curves.preview, curves.source, chain);
              },
            );
            return;
          }

          await confirmLiquidEditionDeploy(chain, opts.yes);
          const { client } = getWalletClient(chain);
          const rare = createRareClient({ publicClient, walletClient: client });
          const tokenUri = await resolveTokenUri(rare, name, opts);
          log(`Deploying liquid edition on ${chain}...`);
          log(`  Factory: ${rare.contracts.liquidFactory}`);
          log(`  Name: ${name}`);
          log(`  Symbol: ${symbol}`);
          log(`  Token URI: ${tokenUri}`);
          log(`  Curve source: ${curves.source}`);
          if (opts.initialRareLiquidity) {
            log(`  Initial RARE liquidity: ${opts.initialRareLiquidity}`);
          }
          if (opts.totalSupply) {
            log(`  Total supply: ${opts.totalSupply}`);
          }
          log('Waiting for confirmation...');

          const result = await rare.liquidEdition.deploy.multiCurve({
            name,
            symbol,
            tokenUri,
            initialRareLiquidity: opts.initialRareLiquidity,
            totalSupply: opts.totalSupply,
            curves: curves.curves,
          });
          const liquidEditionUrl = formatLiquidEditionUrl(rare.chainId, result.contract);

          output(
            {
              txHash: result.txHash,
              blockNumber: result.receipt.blockNumber.toString(),
              contract: result.contract,
              chainId: rare.chainId,
              liquidEditionUrl,
              tokenUri,
              totalSupply: opts.totalSupply ?? null,
              curves: curves.curves,
              source: curves.source,
              rarePriceUsd: curves.rarePriceUsd ?? null,
            },
            () => {
              console.log(`Transaction sent: ${result.txHash}`);
              console.log(`\nLiquid Edition deployed at: ${result.contract}`);
              console.log(`Liquid Editions URL: ${liquidEditionUrl}`);
            },
          );
        } catch (error) {
          printError(error);
        }
      },
    );

  return cmd;
}
