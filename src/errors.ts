export function printContractError(error: unknown): never {
  if (!(error instanceof Error)) {
    console.error('\nTransaction failed:', error);
    process.exit(1);
  }

  console.error('\nTransaction failed:');

  // Walk the cause chain printing each level
  let current: unknown = error;
  let depth = 0;
  while (current instanceof Error) {
    const indent = '  '.repeat(depth + 1);
    // Print the short message if available (viem errors have shortMessage)
    const msg = (current as { shortMessage?: string }).shortMessage ?? current.message;
    console.error(`${indent}${msg}`);

    // viem ContractFunctionRevertedError exposes a `reason` field
    if ('reason' in current && current.reason) {
      console.error(`${indent}Revert reason: ${current.reason}`);
    }

    // viem errors expose metaMessages for extra context
    if ('metaMessages' in current && Array.isArray(current.metaMessages)) {
      for (const line of current.metaMessages as string[]) {
        if (line.trim()) console.error(`${indent}${line.trim()}`);
      }
    }

    current = (current as { cause?: unknown }).cause;
    depth++;
  }

  process.exit(1);
}
