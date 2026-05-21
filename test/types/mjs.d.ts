declare module '*.mjs' {
  export function clearRareCliLocks(options?: {
    tempDir?: string;
    logger?: Pick<Console, 'log'>;
  }): Promise<number>;
  export function hasLiveWalletEnv(role: 'seller' | 'buyer'): boolean;
  export const requiredLiveEnv: readonly string[];
  export function loadDotEnv(file?: string): Record<string, string>;
  export function missingLiveEnv(env?: NodeJS.ProcessEnv): string[];
}
