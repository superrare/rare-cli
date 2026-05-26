export const DEFAULT_RARE_API_BASE_URL = 'https://api.superrare.com';

function normalizeRareApiBaseUrlCandidate(baseUrl: string | undefined): string | undefined {
  const trimmedBaseUrl = baseUrl?.trim();
  return trimmedBaseUrl === '' ? undefined : trimmedBaseUrl;
}

export function resolveRareApiBaseUrl(baseUrl?: string): string {
  return (
    normalizeRareApiBaseUrlCandidate(process.env.RARE_API_BASE_URL) ??
    normalizeRareApiBaseUrlCandidate(baseUrl) ??
    DEFAULT_RARE_API_BASE_URL
  );
}
