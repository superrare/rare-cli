export type ConfirmationOptions = {
  yes?: boolean;
  quoteOnly?: boolean;
};

export type ConfirmationDecision = 'skip' | 'prompt' | 'reject-json' | 'reject-non-interactive';

const confirmationRequiredCommands = new Set([
  'rare swap buy',
  'rare swap sell',
  'rare swap swap',
  'rare swap tokens',
]);

export function getConfirmationDecision(params: {
  commandPath: readonly string[];
  options: ConfirmationOptions;
  stdinIsTty: boolean;
  skipConfirmation: boolean;
  jsonMode: boolean;
}): ConfirmationDecision {
  if (params.options.yes === true || params.options.quoteOnly === true) {
    return 'skip';
  }
  if (!requiresExplicitConfirmation(params.commandPath)) {
    return 'skip';
  }
  if (params.skipConfirmation) {
    return 'skip';
  }
  if (params.jsonMode) {
    return 'reject-json';
  }
  if (!params.stdinIsTty) {
    return 'reject-non-interactive';
  }

  return 'prompt';
}

export function requiresExplicitConfirmation(commandPath: readonly string[]): boolean {
  return confirmationRequiredCommands.has(commandPath.join(' '));
}
