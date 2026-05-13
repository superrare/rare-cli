import { loadDotEnv, missingLiveEnv } from './env.mjs';

loadDotEnv();

const missing = missingLiveEnv();

if (missing.length > 0) {
  console.error(`Missing required live E2E env vars: ${missing.join(', ')}`);
  console.error('Live Sepolia E2E is opt-in. Set the required vars before running npm run test:e2e:live.');
  process.exit(1);
}
