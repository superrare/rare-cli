import { describe, expect, it } from 'vitest';
import { createRareProgram } from '../../src/program.js';

describe('CLI program factory', () => {
  it('builds the command tree without parsing argv', () => {
    const program = createRareProgram();
    const commandNames = program.commands.map((command) => command.name());

    expect(commandNames).toContain('configure');
    expect(commandNames).toContain('collection');
    expect(commandNames).toContain('auction');
    expect(commandNames).toContain('utils');
    expect(program.opts()).toEqual({});
  });
});
