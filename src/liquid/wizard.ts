import { createInterface } from 'node:readline/promises';
import type { ReadStream, WriteStream } from 'node:tty';
import {
  getCurvePresetDefinition,
  type CurvePresetKey,
  type LiquidCurvePreview,
  type LiquidCurveSegment,
} from './curve-config.js';

const PRESETS: CurvePresetKey[] = ['low-demand', 'medium-demand', 'high-demand'];

export interface LiquidCurveWizardResult {
  preset: CurvePresetKey;
  rarePriceUsd: number;
  curves: LiquidCurveSegment[];
  preview: LiquidCurvePreview;
}

export interface LiquidCurveWizardOptions {
  stdin?: ReadStream;
  stdout?: WriteStream;
  generatePresetCurves: (preset: CurvePresetKey) => Promise<LiquidCurveWizardResult>;
}

function printPreview(preview: LiquidCurvePreview): void {
  console.log('\nGenerated multicurve config:');
  console.log(JSON.stringify(preview.segments.map(({ tickLower, tickUpper, numPositions, shares }) => ({ tickLower, tickUpper, numPositions, shares })), null, 2));
  console.log('\nCurve summary:');
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
  while (true) {
    console.log('\nSelect a curve preset:');
    PRESETS.forEach((preset, index) => {
      const info = getCurvePresetDefinition(preset);
      console.log(`  ${index + 1}. ${preset} - ${info.description}`);
    });

    const answer = (await rl.question('Preset number: ')).trim();
    const numeric = Number(answer);
    if (Number.isInteger(numeric) && numeric >= 1 && numeric <= PRESETS.length) {
      return PRESETS[numeric - 1]!;
    }

    if (PRESETS.includes(answer as CurvePresetKey)) {
      return answer as CurvePresetKey;
    }

    console.log('Invalid preset selection.');
  }
}

async function promptForConfirmation(rl: ReturnType<typeof createInterface>): Promise<boolean> {
  while (true) {
    const answer = (await rl.question('\nUse these curves? [y/n]: ')).trim().toLowerCase();
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

    printPreview(generated.preview);
    const confirmed = await promptForConfirmation(rl);
    if (!confirmed) {
      throw new Error('Curve generation cancelled.');
    }

    return generated;
  } finally {
    rl.close();
  }
}
