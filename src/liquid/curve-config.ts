import { type Address } from 'viem';
import type { LiquidFactoryConfig } from './factory-config.js';

export type CurvePresetKey = 'low-demand' | 'medium-demand' | 'high-demand';

export interface LiquidCurveSegment {
  tickLower: number;
  tickUpper: number;
  numPositions: number;
  shares: string;
}

export interface LiquidCurvesValidationResult {
  isValid: boolean;
  curves?: LiquidCurveSegment[];
  error?: string;
  errorMessage?: string;
}

export interface LiquidCurveSegmentSummary {
  tickLower: number;
  tickUpper: number;
  numPositions: number;
  shares: string;
  startTokenPriceUsd?: number;
  endTokenPriceUsd?: number;
}

export interface LiquidCurvePreview {
  totalPositions: number;
  totalShare: number;
  curvePoolSupplyTokens: number;
  maxTotalSupplyTokens: number;
  creatorLaunchRewardTokens: number;
  baseToken: Address;
  rarePriceUsd?: number;
  segments: LiquidCurveSegmentSummary[];
}

type CurvePresetUsdSegment = {
  endTokenPriceUsd: number;
  numPositions: number;
  sharesPercent: number;
};

type CurvePresetUsd = {
  startTokenPriceUsd: number;
  segments: CurvePresetUsdSegment[];
};

type CurvePresetDefinition = {
  title: string;
  description: string;
  coreCurvePresetUsd: CurvePresetUsd;
  reserveTailStartTokenPriceUsd: number;
};

type TokenPriceCurveInput = {
  startTokenPrice: number;
  endTokenPrice: number;
  numPositions: number;
  sharesPercent: number;
};

type UsdTokenPriceCurveInput = {
  startTokenPriceUsd: number;
  endTokenPriceUsd: number;
  numPositions: number;
  sharesPercent: number;
};

const TICK_BASE = 1.0001;
const TICK_LOG_BASE = Math.log(TICK_BASE);
const RESERVE_TAIL_SHARES_PERCENT = 2;
const RESERVE_TAIL_END_PRICE_MULTIPLE = 100;
const SHARES_SUM_TOLERANCE = 1e-6;
const MAX_LIQUIDITY_PER_TICK = 1.15e34;
const MIN_TICK = -887220;
const MAX_TICK = 887220;
const MAX_TOTAL_POSITIONS = 25;

const CURVE_PRESET_DEFINITIONS: Record<CurvePresetKey, CurvePresetDefinition> = {
  'low-demand': {
    title: 'Low Demand',
    description: 'Lower starting price with more supply available earlier in the curve.',
    coreCurvePresetUsd: {
      startTokenPriceUsd: 0.08,
      segments: [
        { endTokenPriceUsd: 0.16, numPositions: 2, sharesPercent: 30 },
        { endTokenPriceUsd: 0.8, numPositions: 2, sharesPercent: 50 },
        { endTokenPriceUsd: 8, numPositions: 1, sharesPercent: 18 },
      ],
    },
    reserveTailStartTokenPriceUsd: 8,
  },
  'medium-demand': {
    title: 'Medium Demand',
    description: 'Middle-ground starting price with supply concentrated through the middle of the curve.',
    coreCurvePresetUsd: {
      startTokenPriceUsd: 0.2,
      segments: [
        { endTokenPriceUsd: 0.4, numPositions: 3, sharesPercent: 10 },
        { endTokenPriceUsd: 2, numPositions: 2, sharesPercent: 65 },
        { endTokenPriceUsd: 20, numPositions: 2, sharesPercent: 23 },
      ],
    },
    reserveTailStartTokenPriceUsd: 20,
  },
  'high-demand': {
    title: 'High Demand',
    description: 'Higher starting price with more supply held back for higher price bands.',
    coreCurvePresetUsd: {
      startTokenPriceUsd: 0.5,
      segments: [
        { endTokenPriceUsd: 1, numPositions: 4, sharesPercent: 10 },
        { endTokenPriceUsd: 5, numPositions: 3, sharesPercent: 40 },
        { endTokenPriceUsd: 50, numPositions: 3, sharesPercent: 48 },
      ],
    },
    reserveTailStartTokenPriceUsd: 50,
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isPositiveFiniteNumber(value: number): boolean {
  return Number.isFinite(value) && value > 0;
}

function toValidNumber(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null;
  return value;
}

function toValidShareNumber(value: unknown): number | null {
  const numeric = typeof value === 'string' ? Number(value) : toValidNumber(value);
  if (numeric === null || numeric <= 0 || numeric > 1) {
    return null;
  }
  return numeric;
}

function formatShareDecimal(value: number): string {
  const normalized = value.toFixed(8).replace(/0+$/, '').replace(/\.$/, '');
  return normalized.length > 0 ? normalized : '0';
}

function alignTickToSpacing(rawTick: number, tickSpacing: number, direction: 'down' | 'up' | 'nearest'): number {
  if (direction === 'down') return Math.floor(rawTick / tickSpacing) * tickSpacing;
  if (direction === 'up') return Math.ceil(rawTick / tickSpacing) * tickSpacing;
  return Math.round(rawTick / tickSpacing) * tickSpacing;
}

function rarePerTokenToRawTick(rarePerToken: number): number {
  return Math.log(rarePerToken) / TICK_LOG_BASE;
}

function usdToRarePerToken(tokenPriceUsd: number, rarePriceUsd: number): number {
  if (!isPositiveFiniteNumber(tokenPriceUsd)) {
    throw new Error('Token price must be greater than 0');
  }
  if (!isPositiveFiniteNumber(rarePriceUsd)) {
    throw new Error('Base token USD price must be greater than 0');
  }
  return tokenPriceUsd / rarePriceUsd;
}

function tokenPriceToTick(tokenPrice: number, tickSpacing: number): number {
  if (!isPositiveFiniteNumber(tokenPrice)) {
    throw new Error('Token price must be greater than 0');
  }
  return alignTickToSpacing(rarePerTokenToRawTick(tokenPrice), tickSpacing, 'nearest');
}

export function tickToRarePerToken(tick: number): number {
  return Math.pow(TICK_BASE, tick);
}

export function tickToTokenPriceUsd(tick: number, rarePriceUsd: number): number {
  return tickToRarePerToken(tick) * rarePriceUsd;
}

function appendReserveTailSegment({
  segments,
  reserveTailStartTokenPriceUsd,
}: {
  segments: UsdTokenPriceCurveInput[];
  reserveTailStartTokenPriceUsd: number;
}): UsdTokenPriceCurveInput[] {
  return [
    ...segments,
    {
      startTokenPriceUsd: reserveTailStartTokenPriceUsd,
      endTokenPriceUsd: reserveTailStartTokenPriceUsd * RESERVE_TAIL_END_PRICE_MULTIPLE,
      numPositions: 1,
      sharesPercent: RESERVE_TAIL_SHARES_PERCENT,
    },
  ];
}

function getUsdTokenPriceCurveInputsForPresetWithReserveTail(curvePresetKey: CurvePresetKey): UsdTokenPriceCurveInput[] {
  const preset = CURVE_PRESET_DEFINITIONS[curvePresetKey];
  let currentStart = preset.coreCurvePresetUsd.startTokenPriceUsd;
  const segments = preset.coreCurvePresetUsd.segments.map((segment) => {
    const next = {
      startTokenPriceUsd: currentStart,
      endTokenPriceUsd: segment.endTokenPriceUsd,
      numPositions: segment.numPositions,
      sharesPercent: segment.sharesPercent,
    };
    currentStart = segment.endTokenPriceUsd;
    return next;
  });

  return appendReserveTailSegment({
    segments,
    reserveTailStartTokenPriceUsd: preset.reserveTailStartTokenPriceUsd,
  });
}

function computeGrossLiquidityAtFarTick(
  tickLower: number,
  totalSpan: number,
  numPositions: number,
  sharesFraction: number,
  totalCurveSupplyTokens: number,
): number {
  const totalAmount = totalCurveSupplyTokens * 1e18 * sharesFraction;
  const amountPerPosition = totalAmount / numPositions;

  let grossLiquidity = 0;
  for (let i = 0; i < numPositions; i += 1) {
    const posUpper = tickLower + ((i + 1) * totalSpan) / numPositions;
    const sqrtLower = Math.pow(TICK_BASE, tickLower / 2);
    const sqrtUpper = Math.pow(TICK_BASE, posUpper / 2);
    const positionLiquidity =
      tickLower <= 0
        ? amountPerPosition / (sqrtUpper - sqrtLower)
        : amountPerPosition / (1 / sqrtLower - 1 / sqrtUpper);

    if (!Number.isFinite(positionLiquidity) || positionLiquidity < 0) {
      return Infinity;
    }
    grossLiquidity += positionLiquidity;
  }

  return grossLiquidity;
}

function getGrossLiquidityOverflow(
  segments: LiquidCurveSegment[],
  totalCurveSupplyTokens: number,
  tickSpacing: number,
): { tick: number; curveIndexes: number[] } | null {
  const positions: Array<{ curveIndex: number; tickLower: number; tickUpper: number; liquidity: number }> = [];

  for (let curveIndex = 0; curveIndex < segments.length; curveIndex += 1) {
    const segment = segments[curveIndex];
    if (!segment) continue;

    const shareFraction = Number(segment.shares);
    const curveSupplyTokens = totalCurveSupplyTokens * shareFraction;
    const amountPerPosition = curveSupplyTokens / segment.numPositions;
    const tickSpan = segment.tickUpper - segment.tickLower;

    for (let positionIndex = 0; positionIndex < segment.numPositions; positionIndex += 1) {
      const rawStartingTick = segment.tickLower + Math.floor((positionIndex * tickSpan) / segment.numPositions);
      const startingTick = Math.floor(rawStartingTick / tickSpacing) * tickSpacing;

      if (startingTick >= segment.tickUpper) continue;

      const sqrtLower = Math.pow(TICK_BASE, startingTick / 2);
      const sqrtUpper = Math.pow(TICK_BASE, segment.tickUpper / 2);
      const liquidityDenominator = 1 / sqrtLower - 1 / sqrtUpper;
      if (!isPositiveFiniteNumber(liquidityDenominator)) {
        return { tick: startingTick, curveIndexes: [curveIndex] };
      }

      const liquidity = amountPerPosition / liquidityDenominator;
      if (!isPositiveFiniteNumber(liquidity)) {
        return { tick: startingTick, curveIndexes: [curveIndex] };
      }

      positions.push({ curveIndex, tickLower: startingTick, tickUpper: segment.tickUpper, liquidity });
    }
  }

  const grossLiquidityByTick = new Map<number, { grossLiquidity: number; curveIndexes: Set<number> }>();
  for (const position of positions) {
    for (const tick of [position.tickLower, position.tickUpper]) {
      const existing = grossLiquidityByTick.get(tick);
      if (existing) {
        existing.grossLiquidity += position.liquidity;
        existing.curveIndexes.add(position.curveIndex);
      } else {
        grossLiquidityByTick.set(tick, { grossLiquidity: position.liquidity, curveIndexes: new Set([position.curveIndex]) });
      }
    }
  }

  for (const [tick, entry] of grossLiquidityByTick.entries()) {
    if (entry.grossLiquidity > MAX_LIQUIDITY_PER_TICK) {
      return { tick, curveIndexes: [...entry.curveIndexes].sort((a, b) => a - b) };
    }
  }

  return null;
}

function validateAndNormalizeSegments(
  rawSegments: unknown[],
  totalCurveSupplyTokens: number,
  tickSpacing: number,
): LiquidCurvesValidationResult {
  if (rawSegments.length === 0) {
    return { isValid: false, error: 'empty', errorMessage: 'Please add at least one curve segment' };
  }

  const parsedSegments: LiquidCurveSegment[] = [];
  for (const segment of rawSegments) {
    if (!isRecord(segment)) {
      return { isValid: false, error: 'invalid-segment', errorMessage: 'Invalid curve segment values' };
    }

    const tickLower = toValidNumber(segment.tickLower);
    const tickUpper = toValidNumber(segment.tickUpper);
    const numPositions = toValidNumber(segment.numPositions);
    const shares = toValidShareNumber(segment.shares);
    if (tickLower === null || tickUpper === null || numPositions === null || shares === null) {
      return { isValid: false, error: 'invalid-segment', errorMessage: 'Invalid curve segment values' };
    }
    if (!Number.isInteger(tickLower) || !Number.isInteger(tickUpper) || !Number.isInteger(numPositions) || numPositions <= 0) {
      return { isValid: false, error: 'invalid-segment', errorMessage: 'Invalid curve segment values' };
    }
    if (tickLower % tickSpacing !== 0 || tickUpper % tickSpacing !== 0) {
      return { isValid: false, error: 'tick-spacing-invalid', errorMessage: `Ticks must align to spacing ${tickSpacing}` };
    }
    if (tickLower < MIN_TICK || tickUpper > MAX_TICK) {
      return { isValid: false, error: 'tick-out-of-bounds', errorMessage: `Ticks must be within Uniswap V4 bounds (${MIN_TICK} to ${MAX_TICK})` };
    }
    if (tickLower >= tickUpper) {
      return { isValid: false, error: 'invalid-segment', errorMessage: 'Invalid curve segment values' };
    }

    parsedSegments.push({
      tickLower,
      tickUpper,
      numPositions,
      shares: `${shares}`,
    });
  }

  const totalPositions = parsedSegments.reduce((sum, segment) => sum + segment.numPositions, 0);
  if (totalPositions > MAX_TOTAL_POSITIONS) {
    return {
      isValid: false,
      error: 'too-many-positions',
      errorMessage: `Total positions across all curves must not exceed ${MAX_TOTAL_POSITIONS}`,
    };
  }

  const sortedSegments = [...parsedSegments].sort((a, b) => a.tickLower - b.tickLower);
  for (let index = 1; index < sortedSegments.length; index += 1) {
    const previous = sortedSegments[index - 1];
    const current = sortedSegments[index];
    if (!previous || !current || current.tickLower !== previous.tickUpper) {
      return {
        isValid: false,
        error: 'segment-overlap',
        errorMessage: 'Curve segments must be contiguous (no overlap or gaps)',
      };
    }
  }

  const shareSum = sortedSegments.reduce((sum, segment) => sum + Number(segment.shares), 0);
  if (Math.abs(shareSum - 1) > SHARES_SUM_TOLERANCE) {
    return { isValid: false, error: 'share-sum-invalid', errorMessage: 'Curve share values must add up to 1' };
  }

  for (const segment of sortedSegments) {
    const minSpan = segment.numPositions * tickSpacing;
    if (segment.tickUpper - segment.tickLower < minSpan) {
      return {
        isValid: false,
        error: 'tick-span-too-narrow',
        errorMessage: 'One or more curve segments have too narrow a tick range for their positions and share allocation.',
      };
    }
    if (computeGrossLiquidityAtFarTick(segment.tickLower, segment.tickUpper - segment.tickLower, segment.numPositions, Number(segment.shares), totalCurveSupplyTokens) > MAX_LIQUIDITY_PER_TICK) {
      return {
        isValid: false,
        error: 'tick-span-too-narrow',
        errorMessage: 'One or more curve segments have too narrow a tick range for their positions and share allocation.',
      };
    }
  }

  const overflow = getGrossLiquidityOverflow(sortedSegments, totalCurveSupplyTokens, tickSpacing);
  if (overflow) {
    return {
      isValid: false,
      error: 'tick-span-too-narrow',
      errorMessage: `Curve segments create too much stacked liquidity at tick ${overflow.tick}. Widen the price range or reduce positions/share.`,
    };
  }

  return { isValid: true, curves: sortedSegments };
}

export function parseCurveConfig(value: string, totalCurveSupplyTokens: number, tickSpacing: number): LiquidCurveSegment[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Invalid curve JSON');
  }
  if (!Array.isArray(parsed)) {
    throw new Error('Invalid curve JSON');
  }

  const validation = validateAndNormalizeSegments(parsed, totalCurveSupplyTokens, tickSpacing);
  if (!validation.isValid || !validation.curves) {
    throw new Error(validation.errorMessage ?? 'Invalid curve configuration');
  }
  return validation.curves;
}

export function validateCurves(
  curves: LiquidCurveSegment[],
  config: Pick<LiquidFactoryConfig, 'curvePoolSupplyTokens' | 'poolTickSpacing'>,
): LiquidCurvesValidationResult {
  return validateAndNormalizeSegments(curves, config.curvePoolSupplyTokens, config.poolTickSpacing);
}

function tokenPriceCurveToSegments(
  segments: TokenPriceCurveInput[],
  tickSpacing: number,
  totalCurveSupplyTokens: number,
): LiquidCurveSegment[] {
  if (segments.length === 0) {
    throw new Error('Please add at least one curve segment');
  }

  const shareSum = segments.reduce((sum, segment) => sum + segment.sharesPercent, 0);
  if (Math.abs(shareSum - 100) > SHARES_SUM_TOLERANCE) {
    throw new Error('Curve share values must add up to 100');
  }

  let previousTickUpper: number | null = null;
  const customCurve = segments.map((segment) => {
    if (!Number.isInteger(segment.numPositions) || segment.numPositions <= 0) {
      throw new Error('Curve positions must be positive integers');
    }
    if (!isPositiveFiniteNumber(segment.startTokenPrice) || !isPositiveFiniteNumber(segment.endTokenPrice)) {
      throw new Error('Token prices must be greater than 0');
    }
    if (segment.startTokenPrice >= segment.endTokenPrice) {
      throw new Error('Start token price must be lower than end token price');
    }
    if (!isPositiveFiniteNumber(segment.sharesPercent) || segment.sharesPercent > 100) {
      throw new Error('Share percent must be greater than 0 and at most 100');
    }

    const tickLower = tokenPriceToTick(segment.startTokenPrice, tickSpacing);
    const tickUpper = tokenPriceToTick(segment.endTokenPrice, tickSpacing);
    if (tickUpper <= tickLower) {
      throw new Error('Start token price must be lower than end token price');
    }
    if (previousTickUpper !== null && tickLower !== previousTickUpper) {
      throw new Error('Curve ranges must touch each other (no overlap and no gaps)');
    }
    previousTickUpper = tickUpper;

    return {
      tickLower,
      tickUpper,
      numPositions: segment.numPositions,
      shares: formatShareDecimal(segment.sharesPercent / 100),
    };
  });

  return parseCurveConfig(JSON.stringify(customCurve), totalCurveSupplyTokens, tickSpacing);
}

function usdTokenPriceCurveToSegments(
  segments: UsdTokenPriceCurveInput[],
  rarePriceUsd: number,
  tickSpacing: number,
  totalCurveSupplyTokens: number,
): LiquidCurveSegment[] {
  return tokenPriceCurveToSegments(
    segments.map((segment) => ({
      startTokenPrice: usdToRarePerToken(segment.startTokenPriceUsd, rarePriceUsd),
      endTokenPrice: usdToRarePerToken(segment.endTokenPriceUsd, rarePriceUsd),
      numPositions: segment.numPositions,
      sharesPercent: segment.sharesPercent,
    })),
    tickSpacing,
    totalCurveSupplyTokens,
  );
}

export function generatePresetCurves(
  preset: CurvePresetKey,
  rarePriceUsd: number,
  config: Pick<LiquidFactoryConfig, 'curvePoolSupplyTokens' | 'poolTickSpacing'>,
): LiquidCurveSegment[] {
  return usdTokenPriceCurveToSegments(
    getUsdTokenPriceCurveInputsForPresetWithReserveTail(preset),
    rarePriceUsd,
    config.poolTickSpacing,
    config.curvePoolSupplyTokens,
  );
}

export function buildCurvePreview(
  curves: LiquidCurveSegment[],
  factoryConfig: Pick<
    LiquidFactoryConfig,
    'curvePoolSupplyTokens' | 'maxTotalSupplyTokens' | 'creatorLaunchRewardTokens' | 'baseToken'
  >,
  rarePriceUsd?: number,
): LiquidCurvePreview {
  return {
    totalPositions: curves.reduce((sum, curve) => sum + curve.numPositions, 0),
    totalShare: curves.reduce((sum, curve) => sum + Number(curve.shares), 0),
    curvePoolSupplyTokens: factoryConfig.curvePoolSupplyTokens,
    maxTotalSupplyTokens: factoryConfig.maxTotalSupplyTokens,
    creatorLaunchRewardTokens: factoryConfig.creatorLaunchRewardTokens,
    baseToken: factoryConfig.baseToken,
    rarePriceUsd,
    segments: curves.map((curve) => ({
      ...curve,
      startTokenPriceUsd: rarePriceUsd ? tickToTokenPriceUsd(curve.tickLower, rarePriceUsd) : undefined,
      endTokenPriceUsd: rarePriceUsd ? tickToTokenPriceUsd(curve.tickUpper, rarePriceUsd) : undefined,
    })),
  };
}

export function getCurvePresetDefinition(preset: CurvePresetKey): { title: string; description: string } {
  const definition = CURVE_PRESET_DEFINITIONS[preset];
  return { title: definition.title, description: definition.description };
}
