export const DEFAULT_RARE_API_BASE_URL = 'https://api.superrare.com';

export function resolveRareApiBaseUrl(baseUrl?: string): string {
  return process.env.RARE_API_BASE_URL ?? baseUrl ?? DEFAULT_RARE_API_BASE_URL;
}
