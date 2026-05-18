import { describe, expect, it } from 'vitest';
import { getConfirmationDecision } from '../../src/confirmation.js';

const confirmableCommand = {
  commandPath: ['rare', 'listing', 'create'],
  hasYesOption: true,
  options: {},
  stdinIsTty: true,
  skipConfirmation: false,
  jsonMode: false,
} as const;

describe('confirmation policy', () => {
  it('prompts for confirmable interactive commands without explicit consent', () => {
    expect(getConfirmationDecision(confirmableCommand)).toBe('prompt');
  });

  it('requires explicit --yes for confirmable JSON commands', () => {
    expect(getConfirmationDecision({
      ...confirmableCommand,
      jsonMode: true,
    })).toBe('reject-json');
  });

  it('skips confirmation when the command has explicit consent or is a preview', () => {
    expect(getConfirmationDecision({
      ...confirmableCommand,
      options: { yes: true },
      jsonMode: true,
    })).toBe('skip');
    expect(getConfirmationDecision({
      ...confirmableCommand,
      options: { preview: true },
      jsonMode: true,
    })).toBe('skip');
    expect(getConfirmationDecision({
      ...confirmableCommand,
      options: { quoteOnly: true },
      jsonMode: true,
    })).toBe('skip');
  });

  it('does not prompt for non-confirmable commands or non-interactive execution', () => {
    expect(getConfirmationDecision({
      ...confirmableCommand,
      hasYesOption: false,
    })).toBe('skip');
    expect(getConfirmationDecision({
      ...confirmableCommand,
      stdinIsTty: false,
    })).toBe('skip');
  });

  it('leaves configure delete to its command-specific confirmation', () => {
    expect(getConfirmationDecision({
      ...confirmableCommand,
      commandPath: ['rare', 'configure', 'delete'],
    })).toBe('skip');
  });
});
