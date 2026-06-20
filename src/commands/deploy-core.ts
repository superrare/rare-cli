import type { CurvePresetKey, LiquidCurvePreview } from '../liquid/curve-config.js';
export { parseStandardTokenAttribute as parseAttribute } from './token-metadata.js';

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

export type LiquidEditionDeployConfirmationDecision =
  | 'skip'
  | 'prompt'
  | 'reject-json'
  | 'reject-non-interactive';

export function getLiquidEditionDeployConfirmationDecision(opts: {
  yes?: boolean;
  jsonMode: boolean;
  stdinIsTty: boolean;
}): LiquidEditionDeployConfirmationDecision {
  if (opts.yes === true) {
    return 'skip';
  }
  if (opts.jsonMode) {
    return 'reject-json';
  }
  if (!opts.stdinIsTty) {
    return 'reject-non-interactive';
  }
  return 'prompt';
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
