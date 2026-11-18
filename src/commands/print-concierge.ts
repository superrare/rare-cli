import { randomBytes, randomUUID } from 'node:crypto';
import { RareApiError } from '@rareprotocol/rare-sdk/data-access';
import { z } from 'zod';
import { printConciergeInput } from './print-input-core.js';
import { savePrintRequest } from './print-request-storage.js';

const path = '/prints/concierge/drafts';
const savedConciergeRequest = printConciergeInput.extend({
  drop: printConciergeInput.shape.drop.extend({ idempotencyKey: z.uuid() }),
  listing: printConciergeInput.shape.listing.unwrap().extend({
    listingSalt: z.string().regex(/^0x[0-9a-fA-F]{64}$/u),
  }).optional(),
});
const responseSchema = z.object({
  data: z.object({
    dropId: z.uuid(),
    option: z.object({ id: z.uuid() }).passthrough(),
    preparationId: z.uuid().optional(),
    listing: z.object({}).passthrough().optional(),
  }).passthrough(),
});

type ConciergeConnection = { readonly endpoint: URL; readonly supportKey: string };
type ConciergeRequest = z.infer<typeof savedConciergeRequest>;
type ConciergeDraft = z.infer<typeof responseSchema>['data'];

export function requireConciergeConnection(env: NodeJS.ProcessEnv): ConciergeConnection {
  const origin = env['PIPELINES_BASE_URL'];
  const supportKey = env['GQL_API_KEY'];
  if (origin === undefined || supportKey === undefined || supportKey.trim() === '') {
    throw new Error('Set PIPELINES_BASE_URL and GQL_API_KEY to use print concierge.');
  }
  const endpoint = URL.parse(origin);
  if (endpoint?.username !== '' || endpoint.password !== '' ||
      endpoint.search !== '' || endpoint.hash !== '' ||
      (endpoint.protocol !== 'https:' &&
        !(endpoint.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(endpoint.hostname)))) {
    throw new Error('PIPELINES_BASE_URL must be an HTTPS URL or a local test URL.');
  }
  return { endpoint: new URL(path, endpoint), supportKey };
}

export async function loadConciergeRequest(
  inputPath: string,
  input: z.infer<typeof printConciergeInput>,
): Promise<ConciergeRequest> {
  return savePrintRequest(inputPath, 'concierge', input, ({ drop, listing, ...terms }) => ({
    ...terms,
    drop: { ...drop, idempotencyKey: drop.idempotencyKey ?? randomUUID() },
    ...(listing === undefined ? {} : {
      listing: { ...listing, listingSalt: listing.listingSalt ?? `0x${randomBytes(32).toString('hex')}` },
    }),
  }), value => savedConciergeRequest.parse(value));
}

export async function createConciergeDraft(
  connection: ConciergeConnection,
  request: ConciergeRequest & { readonly operatorUserId: string },
): Promise<ConciergeDraft> {
  const body = JSON.stringify(request);
  const attempt = async (canRetry: boolean): Promise<ConciergeDraft> => {
    const response = await fetch(connection.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-superrare-support-secret': connection.supportKey },
      body,
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
    }).catch(() => null);
    if (response?.ok === true) {
      const payload: unknown = await response.json().catch(() => null);
      const result = responseSchema.safeParse(payload);
      if (result.success) return result.data.data;
    } else if (response !== null) {
      await response.body?.cancel().catch(() => undefined);
      if (canRetry && response.status < 500 && response.status !== 408) {
        throw new RareApiError('Pipelines rejected the print concierge request.', response.status, path);
      }
    }
    if (canRetry) return attempt(false);
    throw new Error('Pipelines could not confirm the print request. Rerun the same command with the same input file to resume.');
  };
  return attempt(true);
}
