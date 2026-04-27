import type { NftAttribute } from '../sdk/api.js';
import type { CurvePresetKey, LiquidCurvePreview } from '../liquid/curve-config.js';

export function parseAttribute(raw: string): NftAttribute {
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

export function isCurvePresetKey(value: string): value is CurvePresetKey {
  return value === 'low-demand' || value === 'medium-demand' || value === 'high-demand';
}

export function validateRarePriceUsd(value: number, label = 'RARE/USD price'): number {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
  return value;
}

export async function resolveRarePriceUsd(getRarePriceUsd: () => Promise<number>): Promise<number> {
  try {
    return validateRarePriceUsd(await getRarePriceUsd(), 'Fetched RARE/USD price');
  } catch (error) {
    throw new Error(`Could not fetch RARE/USD price automatically: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export async function maybeResolveRarePriceUsd(getRarePriceUsd: () => Promise<number>): Promise<number | undefined> {
  try {
    return await resolveRarePriceUsd(getRarePriceUsd);
  } catch {
    return undefined;
  }
}

export function resolveCurveSourceMode(
  opts: { curvesFile?: string; curvePreset?: string },
  isTty: boolean,
): 'file' | 'preset' | 'wizard' {
  if (opts.curvesFile) return 'file';
  if (opts.curvePreset) return 'preset';
  if (isTty) return 'wizard';
  throw new Error('When --curves-file is omitted, provide --curve-preset or run the command in a TTY for the interactive curve wizard.');
}

export function formatCurvePreview(preview: LiquidCurvePreview, source: string): string[] {
  const lines = [
    `Curve source: ${source}`,
    `Curve pool supply: ${preview.curvePoolSupplyTokens}`,
    `Max total supply: ${preview.maxTotalSupplyTokens}`,
    `Creator launch reward: ${preview.creatorLaunchRewardTokens}`,
    `Total positions: ${preview.totalPositions}`,
    `Share sum: ${preview.totalShare}`,
  ];
  if (preview.rarePriceUsd !== undefined) {
    lines.push(`RARE/USD: ${preview.rarePriceUsd}`);
  }

  lines.push('');
  lines.push('Curves:');
  for (const [index, segment] of preview.segments.entries()) {
    const usdRange =
      segment.startTokenPriceUsd !== undefined && segment.endTokenPriceUsd !== undefined
        ? ` | approx USD ${segment.startTokenPriceUsd.toFixed(4)} -> ${segment.endTokenPriceUsd.toFixed(4)}`
        : '';
    lines.push(
      `  ${index + 1}. ticks ${segment.tickLower} -> ${segment.tickUpper} | positions ${segment.numPositions} | share ${segment.shares}${usdRange}`,
    );
  }

  return lines;
}
