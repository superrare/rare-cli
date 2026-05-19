export type ConfirmationOptions = {
  yes?: boolean;
  preview?: boolean;
  quoteOnly?: boolean;
};

export type ConfirmationDecision = 'skip' | 'prompt' | 'reject-json';

const confirmationRequiredCommands = new Set([
  'rare swap buy',
  'rare swap sell',
  'rare swap swap',
]);

export function getConfirmationDecision(params: {
  commandPath: readonly string[];
  options: ConfirmationOptions;
  stdinIsTty: boolean;
  skipConfirmation: boolean;
  jsonMode: boolean;
}): ConfirmationDecision {
  if (params.options.yes === true || params.options.preview === true || params.options.quoteOnly === true) {
    return 'skip';
  }
  if (!requiresExplicitConfirmation(params.commandPath)) {
    return 'skip';
  }
  if (params.jsonMode) {
    return 'reject-json';
  }
  if (!params.stdinIsTty || params.skipConfirmation) {
    return 'skip';
  }

  return 'prompt';
}

export function requiresExplicitConfirmation(commandPath: readonly string[]): boolean {
  return confirmationRequiredCommands.has(commandPath.join(' '));
}
