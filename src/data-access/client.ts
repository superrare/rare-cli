import createClient, { type Middleware } from 'openapi-fetch';
import type { paths } from './schema.js';
import { RareApiError } from './errors.js';

const DEFAULT_BASE_URL = 'https://api.superrare.com';

const errorMiddleware: Middleware = {
  async onResponse({ response, request }) {
    if (response.ok) return;

    const url = new URL(request.url);
    const path = url.pathname;
    let errorMessage: string | undefined;

    try {
      const body = await response.clone().json();
      errorMessage = body?.error;
    } catch {
      // body wasn't JSON — fall through
    }

    throw new RareApiError(
      errorMessage ?? response.statusText ?? 'Request failed',
      response.status,
      path,
    );
  },
};

export function createApiClient(baseUrl?: string) {
  const client = createClient<paths>({
    baseUrl: baseUrl ?? DEFAULT_BASE_URL,
  });

  client.use(errorMiddleware);

  return client;
}

export type ApiClient = ReturnType<typeof createApiClient>;
