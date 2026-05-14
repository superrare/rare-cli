import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { loadDotEnv, missingLiveEnv } from './env.mjs';

loadDotEnv();

const missing = missingLiveEnv();
if (missing.length > 0) {
  console.error(`Missing required live E2E env vars: ${missing.join(', ')}`);
  console.error('Live E2E is opt-in. Set the required vars in your shell or repo .env before running test:e2e:live.');
  process.exit(1);
}

await run(process.execPath, [
  fileURLToPath(new URL('../../node_modules/tsup/dist/cli-default.js', import.meta.url)),
]);
await run(process.execPath, [
  fileURLToPath(new URL('../../node_modules/vitest/vitest.mjs', import.meta.url)),
  'run',
  'test/e2e-live',
  '--config',
  'vitest.config.ts',
]);

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      env: process.env,
      shell: process.platform === 'win32',
    });

    child.on('error', reject);
    child.on('close', (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} ${args.join(' ')} failed with ${signal ?? `exit code ${code}`}`));
    });
  });
}
