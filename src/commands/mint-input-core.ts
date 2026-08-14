import type { NftAttribute, NftMediaEntry, PinMetadataParams } from '@rareprotocol/rare-sdk';

export type MintMetadataUploadRole = 'image' | 'video';
export type MintMetadataUploadPlan = { role: MintMetadataUploadRole; path: string };
export type MintGeneratedMetadataPlan = {
  name: string;
  description: string;
  tags?: string[];
  attributes?: NftAttribute[];
  uploads: MintMetadataUploadPlan[];
};
export type MintTokenUriPlan =
  | { mode: 'provided'; tokenUri: string }
  | { mode: 'metadata'; metadata: MintGeneratedMetadataPlan };

export function planMintTokenUri(params: {
  tokenUri?: string;
  name?: string;
  description?: string;
  image?: string;
  video?: string;
  tags?: string[];
  attributes?: string[];
}): MintTokenUriPlan {
  if (params.tokenUri) return { mode: 'provided', tokenUri: params.tokenUri };
  if (!params.name) throw new Error('--name is required when not using --token-uri');
  if (!params.description) throw new Error('--description is required when not using --token-uri');
  if (!params.image) throw new Error('--image is required when not using --token-uri');
  return {
    mode: 'metadata',
    metadata: {
      name: params.name,
      description: params.description,
      uploads: [
        { role: 'image', path: params.image },
        ...(params.video ? [{ role: 'video' as const, path: params.video }] : []),
      ],
      ...(params.tags?.length ? { tags: params.tags } : {}),
      ...(params.attributes?.length ? { attributes: params.attributes.map(parseMintAttribute) } : {}),
    },
  };
}

export function buildMintPinMetadataParams(
  plan: MintGeneratedMetadataPlan,
  media: { image: NftMediaEntry; video?: NftMediaEntry },
): PinMetadataParams {
  return { name: plan.name, description: plan.description, image: media.image, video: media.video, tags: plan.tags, attributes: plan.attributes };
}

function parseMintAttribute(raw: string): NftAttribute {
  if (raw.startsWith('{')) {
    const parsed = JSON.parse(raw) as unknown;
    if (isRecord(parsed)) {
      assertFiniteAttributeNumber(parsed.value, 'value', raw);
      assertFiniteAttributeNumber(parsed.max_value, 'max_value', raw);
    }
    if (!isMintAttribute(parsed)) throw new Error(`Attribute JSON must include "value": ${raw}`);
    return parsed;
  }
  const index = raw.indexOf('=');
  if (index === -1) return { trait_type: 'value', value: raw };
  const trait_type = raw.slice(0, index);
  const rawValue = raw.slice(index + 1);
  const numeric = Number(rawValue);
  if (rawValue.length > 0 && !Number.isNaN(numeric) && !Number.isFinite(numeric)) {
    throw new Error(`Attribute value must be a finite number: ${raw}`);
  }
  return { trait_type, value: rawValue.length > 0 && !Number.isNaN(numeric) ? numeric : rawValue };
}

function isMintAttribute(value: unknown): value is NftAttribute {
  if (!isRecord(value)) return false;
  return typeof value.trait_type === 'string' &&
    (typeof value.value === 'string' || (typeof value.value === 'number' && Number.isFinite(value.value))) &&
    (value.display_type === undefined || isDisplayType(value.display_type)) &&
    (value.max_value === undefined || (typeof value.max_value === 'number' && Number.isFinite(value.max_value)));
}

function assertFiniteAttributeNumber(value: unknown, field: string, raw: string): void {
  if (typeof value === 'number' && !Number.isFinite(value)) {
    throw new Error(`Attribute JSON "${field}" must be a finite number: ${raw}`);
  }
}

function isDisplayType(value: unknown): boolean {
  return value === 'number' || value === 'boost_number' || value === 'boost_percentage' || value === 'date';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
