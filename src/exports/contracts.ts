/**
 * Compatibility shim: the SDK now lives in @rareprotocol/rare-sdk. This keeps
 * the `@rareprotocol/rare-cli/contracts` subpath working for existing
 * consumers; new code should import `@rareprotocol/rare-sdk/contracts`.
 */
export * from '@rareprotocol/rare-sdk/contracts';
