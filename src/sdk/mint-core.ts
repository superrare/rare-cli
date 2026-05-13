import type { NftAttribute, NftMediaEntry, PinMetadataParams } from './api-core.js';

export type MintMetadataUploadRole = 'image' | 'video';

export type MintMetadataUploadPlan = {
  role: MintMetadataUploadRole;
  path: string;
};

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

export type MintTokenUriPlanParams = {
  tokenUri?: string;
  name?: string;
  description?: string;
  image?: string;
  video?: string;
  tags?: string[];
  attributes?: string[];
};

export type MintMetadataMedia = {
  image: NftMediaEntry;
  video?: NftMediaEntry;
};

export class MintMetadataOptionsError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MintMetadataOptionsError';
  }
}

export function isMintMetadataOptionsError(error: unknown): error is MintMetadataOptionsError {
  return error instanceof MintMetadataOptionsError;
}

export function parseMintAttribute(raw: string): NftAttribute {
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

export function planMintTokenUri(params: MintTokenUriPlanParams): MintTokenUriPlan {
  if (params.tokenUri) {
    return {
      mode: 'provided',
      tokenUri: params.tokenUri,
    };
  }

  if (!params.name) {
    throw new MintMetadataOptionsError('--name is required when not using --token-uri');
  }
  if (!params.description) {
    throw new MintMetadataOptionsError('--description is required when not using --token-uri');
  }
  if (!params.image) {
    throw new MintMetadataOptionsError('--image is required when not using --token-uri');
  }

  return {
    mode: 'metadata',
    metadata: {
      name: params.name,
      description: params.description,
      uploads: [
        { role: 'image', path: params.image },
        ...(params.video ? [{ role: 'video' as const, path: params.video }] : []),
      ],
      ...(params.tags && params.tags.length > 0 ? { tags: params.tags } : {}),
      ...(params.attributes && params.attributes.length > 0
        ? { attributes: params.attributes.map(parseMintAttribute) }
        : {}),
    },
  };
}

export function buildMintPinMetadataParams(
  plan: MintGeneratedMetadataPlan,
  media: MintMetadataMedia,
): PinMetadataParams {
  return {
    name: plan.name,
    description: plan.description,
    image: media.image,
    video: media.video,
    tags: plan.tags,
    attributes: plan.attributes,
  };
}
