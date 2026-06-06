export function readOptionalProcessEnv(name: string): string | undefined {
  const processValue: unknown = Reflect.get(globalThis, 'process');
  if (!isRecord(processValue)) return undefined;

  const envValue = processValue.env;
  if (!isRecord(envValue)) return undefined;

  const value = envValue[name];
  return typeof value === 'string' ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
