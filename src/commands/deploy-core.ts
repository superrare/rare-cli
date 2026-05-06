import type { NftAttribute } from '../sdk/api.js';
import type { CurvePresetKey, LiquidCurvePreview } from '../liquid/curve-config.js';

const DISPLAY_TYPES: readonly NonNullable<NftAttribute['display_type']>[] = [
  'number',
  'boost_number',
  'boost_percentage',
  'date',
];

function isDisplayType(value: string): value is NonNullable<NftAttribute['display_type']> {
  return DISPLAY_TYPES.some((displayType) => displayType === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function parseAttributeValue(value: unknown, raw: string): string | number {
  if (typeof value === 'string' || typeof value === 'number') {
    return value;
  }
  throw new Error(`Attribute JSON "value" must be a string or number: ${raw}`);
}

function parseOptionalString(value: unknown, field: string, raw: string): string | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new Error(`Attribute JSON "${field}" must be a string: ${raw}`);
  }
  return value;
}

function parseOptionalNumber(value: unknown, field: string, raw: string): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`Attribute JSON "${field}" must be a finite number: ${raw}`);
  }
  return value;
}

function parseDisplayType(value: unknown, raw: string): NftAttribute['display_type'] {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== 'string' || !isDisplayType(value)) {
    throw new Error(`Attribute JSON "display_type" is invalid: ${raw}`);
  }
  return value;
}

function parseAttributeJson(raw: string): NftAttribute {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(`Invalid attribute JSON: ${raw}`);
  }

  if (!isRecord(parsed) || parsed.value === undefined) {
    throw new Error(`Attribute JSON must include "value": ${raw}`);
  }

  return {
    value: parseAttributeValue(parsed.value, raw),
    trait_type: parseOptionalString(parsed.trait_type, 'trait_type', raw),
    display_type: parseDisplayType(parsed.display_type, raw),
    max_value: parseOptionalNumber(parsed.max_value, 'max_value', raw),
  };
}

export function parseAttribute(raw: string): NftAttribute {
  if (raw.startsWith('{')) {
    return parseAttributeJson(raw);
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

export function resolveCurveSourceMode(
  opts: { curvesFile?: string; curvePreset?: string },
  isTty: boolean,
): 'file' | 'preset' | 'wizard' {
  if (opts.curvesFile) return 'file';
  if (opts.curvePreset) return 'preset';
  if (isTty) return 'wizard';
  throw new Error('When --curves-file is omitted, provide --curve-preset or run the command in a TTY for the interactive curve wizard.');
}

export function formatLiquidEditionUrl(chainId: number, contractAddress: string): string {
  return `https://superrare.com/liquid-editions/${chainId}/${contractAddress}`;
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
