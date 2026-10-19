/** Serialize contract quantities without losing integer precision. */
export function serializeOutputJson(value: unknown): string | undefined {
  return JSON.stringify(value, (_key: string, entry: unknown): unknown => typeof entry === 'bigint' ? entry.toString() : entry, 2);
}
