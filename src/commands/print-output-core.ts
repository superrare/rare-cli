/** Present print records without exposing JSON transport syntax in human mode. */
export function formatPrintOutput(value: unknown, indent = ''): string[] {
  if (Array.isArray(value)) {
    return value.length === 0 ? [`${indent}No items.`]
      : value.flatMap((entry: unknown, index: number) => [`${indent}${index + 1}.`, ...formatPrintOutput(entry, `${indent}  `)]);
  }
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).flatMap(([key, entry]) => {
      const words = key.replace(/([a-z0-9])([A-Z])/gu, '$1 $2').replace(/_/gu, ' ').toLowerCase();
      const label = `${words.slice(0, 1).toUpperCase()}${words.slice(1)}`;
      return typeof entry === 'object' && entry !== null
        ? [`${indent}${label}:`, ...formatPrintOutput(entry, `${indent}  `)]
        : [`${indent}${label}: ${entry === null || entry === undefined ? 'Not set' : String(entry)}`];
    });
  }
  return [`${indent}${String(value)}`];
}
