/**
 * Compatibility shim: the SDK now lives in @rareprotocol/rare-sdk. This keeps
 * the `@rareprotocol/rare-cli/client` subpath working for existing consumers;
 * new code should import `@rareprotocol/rare-sdk` directly.
 */
export * from '@rareprotocol/rare-sdk/client';
