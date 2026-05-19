import { loadDotEnv } from './env.js';
import { printError } from './errors.js';
import { createRareProgram } from './program.js';

loadDotEnv();

const program = createRareProgram();

program.parseAsync(process.argv).catch((err: unknown) => {
  printError(err);
});
