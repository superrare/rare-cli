import { printError } from './errors.js';
import { createRareProgram } from './program.js';

const program = createRareProgram();

program.parseAsync(process.argv).catch((err: unknown) => {
  printError(err);
});
