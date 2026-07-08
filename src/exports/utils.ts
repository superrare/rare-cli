/**
 * Compatibility shim: the SDK now lives in @rareprotocol/rare-sdk. This keeps
 * the `@rareprotocol/rare-cli/utils` subpath working for existing consumers;
 * new code should import `@rareprotocol/rare-sdk/utils`.
 */
export * from '@rareprotocol/rare-sdk/utils';
