import { describe, expect, it } from 'vitest';
import { getConfirmationDecision, requiresExplicitConfirmation } from '../../src/confirmation.js';

const confirmableCommand = {
  commandPath: ['rare', 'swap', 'sell'],
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

  it('does not prompt for commands without extra confirmation policy or non-interactive execution', () => {
    expect(getConfirmationDecision({
      ...confirmableCommand,
      commandPath: ['rare', 'collection', 'deploy', 'erc721'],
    })).toBe('skip');
    expect(getConfirmationDecision({
      ...confirmableCommand,
      stdinIsTty: false,
    })).toBe('skip');
  });

  it('only marks commands with approvals or surprising state changes as confirmable', () => {
    expect(requiresExplicitConfirmation(['rare', 'listing', 'create'])).toBe(false);
    expect(requiresExplicitConfirmation(['rare', 'auction', 'create'])).toBe(false);
    expect(requiresExplicitConfirmation(['rare', 'listing', 'buy'])).toBe(false);
    expect(requiresExplicitConfirmation(['rare', 'auction', 'bid'])).toBe(false);
    expect(requiresExplicitConfirmation(['rare', 'offer', 'create'])).toBe(false);
    expect(requiresExplicitConfirmation(['rare', 'offer', 'accept'])).toBe(false);
    expect(requiresExplicitConfirmation(['rare', 'listing', 'batch', 'create'])).toBe(false);
    expect(requiresExplicitConfirmation(['rare', 'listing', 'batch', 'buy'])).toBe(false);
    expect(requiresExplicitConfirmation(['rare', 'offer', 'batch', 'create'])).toBe(false);
    expect(requiresExplicitConfirmation(['rare', 'offer', 'batch', 'accept'])).toBe(false);
    expect(requiresExplicitConfirmation(['rare', 'auction', 'batch', 'create'])).toBe(false);
    expect(requiresExplicitConfirmation(['rare', 'auction', 'batch', 'bid'])).toBe(false);
    expect(requiresExplicitConfirmation(['rare', 'listing', 'release', 'mint'])).toBe(false);
    expect(requiresExplicitConfirmation(['rare', 'swap', 'sell'])).toBe(true);
    expect(requiresExplicitConfirmation(['rare', 'collection', 'deploy', 'erc721'])).toBe(false);
    expect(requiresExplicitConfirmation(['rare', 'listing', 'cancel'])).toBe(false);
  });
});
