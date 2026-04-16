import { isJsonMode } from './output.js';
import { RareApiError } from './data-access/errors.js';

/**
 * Strip non-printable control characters and Unicode replacement characters
 * from error strings. Solidity reverts with abi.encodePacked(require-string)
 * often leave padded zero bytes and malformed UTF-8 in viem's `reason` field.
 */
function sanitize(s: string): string {
  return s
    // drop control chars except \t \n \r
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
    // drop Unicode replacement characters from bad UTF-8 decode
    .replace(/\uFFFD+/g, '')
    .trim();
}

/**
 * Build a structured error object from any error, walking viem's cause chain.
 */
function buildErrorDetails(error: unknown): { message: string; details: string[]; causes: string[] } {
  if (!(error instanceof Error)) {
    return { message: sanitize(String(error)), details: [], causes: [] };
  }

  const rawMessage = (error as { shortMessage?: string }).shortMessage ?? error.message;
  const message = sanitize(rawMessage);
  const details: string[] = [];
  const causes: string[] = [];

  // viem ContractFunctionRevertedError exposes a `reason` field
  if ('reason' in error && error.reason) {
    const reason = sanitize(String(error.reason));
    if (reason) details.push(`Revert reason: ${reason}`);
  }

  // viem errors expose metaMessages for extra context
  if ('metaMessages' in error && Array.isArray(error.metaMessages)) {
    for (const line of error.metaMessages as string[]) {
      const clean = sanitize(line);
      if (clean) details.push(clean);
    }
  }

  // API errors have status and path
  if (error instanceof RareApiError) {
    details.push(`Status: ${error.status}`);
    details.push(`Path: ${error.path}`);
  }

  // Walk the cause chain
  let current = (error as { cause?: unknown }).cause;
  while (current instanceof Error) {
    const rawCauseMsg = (current as { shortMessage?: string }).shortMessage ?? current.message;
    const causeMsg = sanitize(rawCauseMsg);
    if (causeMsg) causes.push(causeMsg);

    if ('reason' in current && current.reason) {
      const reason = sanitize(String(current.reason));
      if (reason) causes.push(`Revert reason: ${reason}`);
    }
    if ('metaMessages' in current && Array.isArray(current.metaMessages)) {
      for (const line of current.metaMessages as string[]) {
        const clean = sanitize(line);
        if (clean) causes.push(clean);
      }
    }

    current = (current as { cause?: unknown }).cause;
  }

  return { message, details, causes };
}

/**
 * Print an error and exit. Handles contract errors, API errors, and generic errors.
 * In JSON mode, outputs a structured JSON object to stderr.
 */
export function printError(error: unknown): never {
  const { message, details, causes } = buildErrorDetails(error);

  if (isJsonMode()) {
    const json: Record<string, unknown> = {
      error: true,
      message,
    };
    if (details.length > 0) json.details = details;
    if (causes.length > 0) json.causes = causes;

    console.error(JSON.stringify(json, null, 2));
  } else {
    console.error(`\nError: ${message}`);

    for (const detail of details) {
      console.error(`  ${detail}`);
    }

    if (causes.length > 0) {
      for (const cause of causes) {
        console.error(`  ${cause}`);
      }
    }
  }

  process.exit(1);
}

/**
 * @deprecated Use printError instead. Kept as an alias for backward compatibility.
 */
export const printContractError = printError;
