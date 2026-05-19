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
  const parsed = parseJson(raw);

  if (!isRecord(parsed) || parsed.value === undefined) {
    throw new Error(`Attribute JSON must include "value": ${raw}`);
  }

  const trait_type = parseOptionalString(parsed.trait_type, 'trait_type', raw) ?? 'value';

  return {
    value: parseAttributeValue(parsed.value, raw),
    trait_type,
    display_type: parseDisplayType(parsed.display_type, raw),
    max_value: parseOptionalNumber(parsed.max_value, 'max_value', raw),
  };
}

function parseJson(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    throw new Error(`Invalid attribute JSON: ${raw}`);
  }
}

export function parseAttribute(raw: string): NftAttribute {
  if (raw.startsWith('{')) {
    return parseAttributeJson(raw);
  }

  const eqIndex = raw.indexOf('=');
  if (eqIndex === -1) {
    return { trait_type: 'value', value: raw };
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

export type LiquidEditionDeployMetadataValidationResult =
  | { isValid: true }
  | { isValid: false; missingOptions: string[]; errorMessage: string };

export function validateLiquidEditionDeployMetadataOptions(opts: {
  preview?: boolean;
  tokenUri?: string;
  description?: string;
  image?: string;
}): LiquidEditionDeployMetadataValidationResult {
  if (opts.preview || opts.tokenUri) {
    return { isValid: true };
  }

  const missingOptions = [
    opts.description ? undefined : '--description',
    opts.image ? undefined : '--image',
  ].filter((option): option is string => option !== undefined);

  if (missingOptions.length === 0) {
    return { isValid: true };
  }

  const formattedOptions = missingOptions.length === 1
    ? missingOptions[0]
    : `${missingOptions.slice(0, -1).join(', ')} and ${missingOptions.at(-1)}`;

  return {
    isValid: false,
    missingOptions,
    errorMessage: `${formattedOptions} ${missingOptions.length === 1 ? 'is' : 'are'} required when not using --token-uri.`,
  };
}

export function formatLiquidEditionUrl(chainId: number, contractAddress: string): string {
  return `https://superrare.com/liquid-editions/${chainId}/${contractAddress}`;
}

export function formatCurvePreview(preview: LiquidCurvePreview, source: string, targetChain?: string): string[] {
  const baseLines = [
    `Curve source: ${source}`,
    ...(targetChain === undefined ? [] : [`Target chain: ${targetChain}`]),
    `Curve pool supply: ${preview.curvePoolSupplyTokens}`,
    `Max total supply: ${preview.maxTotalSupplyTokens}`,
    `Creator launch reward: ${preview.creatorLaunchRewardTokens}`,
    `Total positions: ${preview.totalPositions}`,
    `Share sum: ${preview.totalShare}`,
  ];
  const rarePriceLine = preview.rarePriceUsd === undefined ? [] : [`RARE/USD: ${preview.rarePriceUsd}`];
  const curveLines = preview.segments.map((segment, index) => {
    const usdRange =
      segment.startTokenPriceUsd !== undefined && segment.endTokenPriceUsd !== undefined
        ? ` | approx USD ${segment.startTokenPriceUsd.toFixed(4)} -> ${segment.endTokenPriceUsd.toFixed(4)}`
        : '';
    return `  ${index + 1}. ticks ${segment.tickLower} -> ${segment.tickUpper} | positions ${segment.numPositions} | share ${segment.shares}${usdRange}`;
  });

  return [...baseLines, ...rarePriceLine, '', 'Curves:', ...curveLines];
}
