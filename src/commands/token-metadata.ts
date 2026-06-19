import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import type { NftAttribute, NftMediaEntry } from '../sdk/api.js';
import type { RareClient } from '../sdk/client.js';
import { log } from '../output.js';

export type TokenMetadataOptions = {
  tokenUri?: string;
  description?: string;
  image?: string;
  video?: string;
  tag: string[];
  attribute: string[];
};

export type TokenMetadataValidationResult =
  | { isValid: true }
  | { isValid: false; missingOptions: string[]; errorMessage: string };

const DISPLAY_TYPES: readonly NonNullable<NftAttribute['display_type']>[] = [
  'number',
  'boost_number',
  'boost_percentage',
  'date',
];

export function collectRepeatedString(value: string, previous: string[]): string[] {
  return [...previous, value];
}

export function hasGeneratedTokenMetadataOptions(opts: TokenMetadataOptions): boolean {
  return opts.description !== undefined ||
    opts.image !== undefined ||
    opts.video !== undefined ||
    opts.tag.length > 0 ||
    opts.attribute.length > 0;
}

export function validateGeneratedTokenMetadataOptions(opts: {
  tokenUri?: string;
  description?: string;
  image?: string;
}): TokenMetadataValidationResult {
  if (opts.tokenUri !== undefined) {
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

export async function preflightTokenMetadataFiles(opts: {
  tokenUri?: string;
  image?: string;
  video?: string;
  allowEmptyTokenUri?: boolean;
}): Promise<void> {
  if (hasProvidedTokenUri(opts)) {
    return;
  }
  if (opts.image !== undefined) {
    await readMetadataFile(opts.image, 'image');
  }
  if (opts.video !== undefined) {
    await readMetadataFile(opts.video, 'video');
  }
}

export async function resolveStandardTokenUri(
  rare: Pick<RareClient, 'media'>,
  tokenName: string,
  opts: TokenMetadataOptions & { allowBlank?: boolean; allowEmptyTokenUri?: boolean },
): Promise<string> {
  if (hasProvidedTokenUri(opts)) {
    return opts.tokenUri;
  }
  if (opts.allowBlank === true && !hasGeneratedTokenMetadataOptions(opts)) {
    return '';
  }
  if (!opts.description) {
    throw new Error('--description is required when not using --token-uri');
  }
  if (!opts.image) {
    throw new Error('--image is required when not using --token-uri');
  }

  const image = await uploadTokenMetadataMedia(rare, { role: 'image', path: opts.image });
  const video = opts.video === undefined
    ? undefined
    : await uploadTokenMetadataMedia(rare, { role: 'video', path: opts.video });
  const attributes = opts.attribute.length > 0 ? opts.attribute.map(parseStandardTokenAttribute) : undefined;
  const tags = opts.tag.length > 0 ? opts.tag : undefined;

  return rare.media.pinMetadata({
    name: tokenName,
    description: opts.description,
    image,
    video,
    tags,
    attributes,
  });
}

function hasProvidedTokenUri(opts: { tokenUri?: string; allowEmptyTokenUri?: boolean }): opts is {
  tokenUri: string;
  allowEmptyTokenUri?: boolean;
} {
  return opts.tokenUri !== undefined && (opts.allowEmptyTokenUri === true || opts.tokenUri.length > 0);
}

export function parseStandardTokenAttribute(raw: string): NftAttribute {
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
  if (rawValue.length > 0 && !Number.isNaN(numValue) && !Number.isFinite(numValue)) {
    throw new Error(`Attribute value must be a finite number: ${raw}`);
  }
  const value = rawValue.length > 0 && !Number.isNaN(numValue) ? numValue : rawValue;
  return { trait_type, value };
}

async function uploadTokenMetadataMedia(
  rare: Pick<RareClient, 'media'>,
  upload: { role: 'image' | 'video'; path: string },
): Promise<NftMediaEntry> {
  const buffer = await readMetadataFile(upload.path, upload.role);
  const filename = basename(upload.path);
  const label = upload.role === 'image' ? 'Image' : 'Video';
  log(`Uploading ${upload.role}: ${filename} (${buffer.byteLength} bytes)`);
  const media = await rare.media.upload(new Uint8Array(buffer), filename);
  log(`  ${label} uploaded: ${media.url}`);
  return media;
}

async function readMetadataFile(path: string, role: 'image' | 'video'): Promise<Buffer> {
  try {
    return await readFile(path);
  } catch (error) {
    throw new Error(`Could not read ${role} file: ${path}`, { cause: error });
  }
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

function parseAttributeValue(value: unknown, raw: string): string | number {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'number') {
    throw new Error(`Attribute JSON "value" must be a finite number: ${raw}`);
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

function isDisplayType(value: string): value is NonNullable<NftAttribute['display_type']> {
  return DISPLAY_TYPES.some((displayType) => displayType === value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
