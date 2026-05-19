import { createInterface } from 'node:readline/promises';
import type { Readable, Writable } from 'node:stream';
import {
  getCurvePresetDefinition,
  type CurvePresetKey,
  type LiquidCurvePreview,
  type LiquidCurveSegment,
} from './curve-config.js';

const PRESETS: CurvePresetKey[] = ['low-demand', 'medium-demand', 'high-demand'];

function isCurvePresetKey(value: string): value is CurvePresetKey {
  return PRESETS.some((preset) => preset === value);
}

export type LiquidCurveWizardResult = {
  preset: CurvePresetKey;
  rarePriceUsd: number;
  curves: LiquidCurveSegment[];
  preview: LiquidCurvePreview;
}

export type LiquidCurveWizardOptions = {
  stdin?: Readable;
  stdout?: Writable;
  skipConfirmation?: boolean;
  targetChain?: string;
  generatePresetCurves: (preset: CurvePresetKey) => Promise<LiquidCurveWizardResult>;
}

function printPreview(preview: LiquidCurvePreview, targetChain?: string): void {
  console.log('\nGenerated multicurve config:');
  console.log(JSON.stringify(preview.segments.map(({ tickLower, tickUpper, numPositions, shares }) => ({ tickLower, tickUpper, numPositions, shares })), null, 2));
  console.log('\nCurve summary:');
  if (targetChain) {
    console.log(`  Target chain: ${targetChain}`);
  }
  console.log(`  Total positions: ${preview.totalPositions}`);
  console.log(`  Curve share sum: ${preview.totalShare}`);
  console.log(`  Curve pool supply: ${preview.curvePoolSupplyTokens}`);
  console.log(`  Max total supply: ${preview.maxTotalSupplyTokens}`);
  console.log(`  Creator launch reward: ${preview.creatorLaunchRewardTokens}`);
  if (preview.rarePriceUsd) {
    console.log(`  RARE/USD: ${preview.rarePriceUsd}`);
  }

  console.log('\nSegments:');
  for (const [index, segment] of preview.segments.entries()) {
    const usdRange =
      segment.startTokenPriceUsd !== undefined && segment.endTokenPriceUsd !== undefined
        ? ` | approx USD ${segment.startTokenPriceUsd.toFixed(4)} -> ${segment.endTokenPriceUsd.toFixed(4)}`
        : '';
    console.log(
      `  ${index + 1}. ticks ${segment.tickLower} -> ${segment.tickUpper} | positions ${segment.numPositions} | share ${segment.shares}${usdRange}`,
    );
  }
}

async function promptForPreset(rl: ReturnType<typeof createInterface>): Promise<CurvePresetKey> {
  for (;;) {
    console.log('\nSelect a curve preset:');
    PRESETS.forEach((preset, index) => {
      const info = getCurvePresetDefinition(preset);
      console.log(`  ${index + 1}. ${preset} - ${info.description}`);
    });

    const answer = (await rl.question('Preset number: ')).trim();
    const numeric = Number(answer);
    if (Number.isInteger(numeric) && numeric >= 1 && numeric <= PRESETS.length) {
      const preset = PRESETS[numeric - 1];
      if (preset !== undefined) {
        return preset;
      }
    }

    if (isCurvePresetKey(answer)) {
      return answer;
    }

    console.log('Invalid preset selection.');
  }
}

async function promptForConfirmation(rl: ReturnType<typeof createInterface>, targetChain?: string): Promise<boolean> {
  for (;;) {
    const prompt = targetChain === undefined ? '\nUse these curves? [y/n]: ' : `\nUse these curves for ${targetChain}? [y/n]: `;
    const answer = (await rl.question(prompt)).trim().toLowerCase();
    if (answer === 'y' || answer === 'yes') return true;
    if (answer === 'n' || answer === 'no') return false;
    console.log('Please answer "y" or "n".');
  }
}

export async function runLiquidCurveWizard(opts: LiquidCurveWizardOptions): Promise<LiquidCurveWizardResult> {
  const rl = createInterface({
    input: opts.stdin ?? process.stdin,
    output: opts.stdout ?? process.stdout,
  });

  try {
    const preset = await promptForPreset(rl);
    const generated = await opts.generatePresetCurves(preset);
    console.log(`\nUsing fetched RARE/USD price: ${generated.rarePriceUsd}`);

    printPreview(generated.preview, opts.targetChain);
    if (!opts.skipConfirmation) {
      const confirmed = await promptForConfirmation(rl, opts.targetChain);
      if (!confirmed) {
        throw new Error('Curve generation cancelled.');
      }
    }

    return generated;
  } finally {
    rl.close();
  }
}
