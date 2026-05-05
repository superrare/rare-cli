import { vi } from 'vitest';

export type FetchRecord = {
  request: Request;
  body: unknown;
};

export function stubFetch(handler: (request: Request, index: number) => Promise<Response> | Response): {
  records: FetchRecord[];
  fetchMock: ReturnType<typeof vi.fn>;
} {
  const records: FetchRecord[] = [];
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const body = await parseBody(request);
    records.push({ request, body });
    return handler(request, records.length - 1);
  });
  vi.stubGlobal('fetch', fetchMock);
  return { records, fetchMock };
}

export async function parseBody(request: Request): Promise<unknown> {
  if (request.method === 'GET' || request.method === 'HEAD') return undefined;
  const text = await request.clone().text();
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
