import createClient, { type Middleware } from 'openapi-fetch';
import type { paths } from './schema.js';
import { RareApiError } from './errors.js';
import { resolveRareApiBaseUrl } from './base-url.js';

const errorMiddleware: Middleware = {
  async onResponse({ response, request }) {
    if (response.ok) return;

    const url = new URL(request.url);
    const path = url.pathname;
    const errorMessage = await readErrorMessage(response);
    const fallback = response.statusText.length > 0 ? response.statusText : 'Request failed';

    throw new RareApiError(
      errorMessage ?? fallback,
      response.status,
      path,
    );
  },
};

export function createApiClient(
  baseUrl?: string,
  fetch?: typeof globalThis.fetch,
): ReturnType<typeof createClient<paths>> {
  const client = createClient<paths>({
    baseUrl: resolveRareApiBaseUrl(baseUrl),
    ...(fetch === undefined ? {} : { fetch }),
  });

  client.use(errorMiddleware);

  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;

async function readErrorMessage(response: Response): Promise<string | undefined> {
  try {
    const body: unknown = await response.clone().json();
    return isErrorBody(body) ? body.error : undefined;
  } catch {
    return undefined;
  }
}

function isErrorBody(value: unknown): value is { error: string } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'error' in value &&
    typeof value.error === 'string'
  );
}
