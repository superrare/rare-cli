export type AuthStorageScope = { authBaseUrl: string; apiBaseUrl: string; clientId: string };
export type StorageScopeResult =
  | { ok: true; scope: AuthStorageScope }
  | { ok: false; message: string };

/** URL parsing belongs at the shell boundary; this function validates plain data. */
export function validateStorageScope(url: URL, apiUrl: URL, clientId: string): StorageScopeResult {
  if (![url, apiUrl].every(isSafeUrl)) {
    return { ok: false, message: 'Auth storage requires an HTTPS authority (HTTP is allowed only on loopback), without credentials, query or fragment.' };
  }
  if (clientId.trim() === '' || clientId !== clientId.trim()) {
    return { ok: false, message: 'Auth storage requires a nonempty client ID without surrounding whitespace.' };
  }
  return { ok: true, scope: { authBaseUrl: url.href.replace(/\/+$/u, ''), apiBaseUrl: apiUrl.href.replace(/\/+$/u, ''), clientId } };
}

function isSafeUrl(url: URL): boolean {
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  return (url.protocol === 'https:' || (url.protocol === 'http:' && loopback)) &&
    url.username === '' && url.password === '' && url.search === '' && url.hash === '';
}
