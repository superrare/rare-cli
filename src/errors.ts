import { isJsonMode } from './output.js';
import { RareApiError } from './data-access/errors.js';

type ErrorDetails = {
  message: string;
  details: string[];
  causes: string[];
};

function sanitize(s: string): string {
  return s
    .replace(/[\x00-\x08\x0B-\x0C\x0E-\x1F\x7F]/g, '')
    .replace(/\uFFFD+/g, '')
    .trim();
}

function buildErrorDetails(error: unknown): ErrorDetails {
  if (!(error instanceof Error)) {
    return { message: sanitize(String(error)), details: [], causes: [] };
  }

  return {
    message: sanitize(getErrorMessage(error)),
    details: getDetailLines(error),
    causes: collectCauses(getCause(error)),
  };
}

function getDetailLines(error: Error): string[] {
  return [
    ...getReasonLines(error),
    ...getMetaMessageLines(error),
    ...getApiErrorLines(error),
  ];
}

function getReasonLines(error: Error): string[] {
  const reason = getReason(error);
  const cleanReason = isStringifiable(reason) ? sanitize(String(reason)) : '';
  return cleanReason.length > 0 ? [`Revert reason: ${cleanReason}`] : [];
}

function isStringifiable(value: unknown): value is string | number | bigint | boolean {
  return (
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'bigint' ||
    typeof value === 'boolean'
  );
}

function getMetaMessageLines(error: Error): string[] {
  return getMetaMessages(error)
    .map(sanitize)
    .filter((line) => line.length > 0);
}

function getApiErrorLines(error: Error): string[] {
  return error instanceof RareApiError
    ? [`Status: ${String(error.status)}`, `Path: ${error.path}`]
    : [];
}

function collectCauses(current: unknown): string[] {
  if (!(current instanceof Error)) {
    return [];
  }

  const causeMessage = sanitize(getErrorMessage(current));
  const currentLines = [
    ...(causeMessage.length > 0 ? [causeMessage] : []),
    ...getReasonLines(current),
    ...getMetaMessageLines(current),
  ];

  return [...currentLines, ...collectCauses(getCause(current))];
}

function getErrorMessage(error: Error): string {
  return getStringProperty(error, 'shortMessage') ?? error.message;
}

function getReason(error: Error): unknown {
  return getProperty(error, 'reason');
}

function getMetaMessages(error: Error): string[] {
  const metaMessages = getProperty(error, 'metaMessages');
  return Array.isArray(metaMessages) && metaMessages.every((line) => typeof line === 'string')
    ? metaMessages
    : [];
}

function getCause(error: Error): unknown {
  return getProperty(error, 'cause');
}

function getStringProperty(value: object, key: string): string | undefined {
  const property = getProperty(value, key);
  return typeof property === 'string' ? property : undefined;
}

function getProperty(value: object, key: string): unknown {
  return Object.getOwnPropertyDescriptor(value, key)?.value;
}

export function printError(error: unknown): never {
  const { message, details, causes } = buildErrorDetails(error);

  if (isJsonMode()) {
    const json: Record<string, unknown> = {
      error: true,
      message,
      ...(details.length > 0 ? { details } : {}),
      ...(causes.length > 0 ? { causes } : {}),
    };

    console.error(JSON.stringify(json, null, 2));
  } else {
    console.error(`\nError: ${message}`);

    for (const detail of details) {
      console.error(`  ${detail}`);
    }

    for (const cause of causes) {
      console.error(`  ${cause}`);
    }
  }

  process.exit(1);
}
