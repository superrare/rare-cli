export type ConfirmationOptions = {
  yes?: boolean;
  preview?: boolean;
  quoteOnly?: boolean;
};

export type ConfirmationDecision = 'skip' | 'prompt' | 'reject-json';

export function getConfirmationDecision(params: {
  commandPath: readonly string[];
  hasYesOption: boolean;
  options: ConfirmationOptions;
  stdinIsTty: boolean;
  skipConfirmation: boolean;
  jsonMode: boolean;
}): ConfirmationDecision {
  if (params.options.yes === true || params.options.preview === true || params.options.quoteOnly === true) {
    return 'skip';
  }
  if (!params.hasYesOption) {
    return 'skip';
  }
  if (params.commandPath.join(' ') === 'rare configure delete') {
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
