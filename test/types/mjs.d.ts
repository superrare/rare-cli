declare module '*.mjs' {
  export const requiredLiveEnv: readonly string[];
  export function loadDotEnv(file?: string): Record<string, string>;
  export function missingLiveEnv(env?: NodeJS.ProcessEnv): string[];
}
