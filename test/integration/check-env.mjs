import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const envPath = resolve(process.cwd(), '.env');
if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}

if (!process.env.TEST_RPC_URL) {
  console.error('Missing required integration test env var: TEST_RPC_URL');
  console.error('npm run test includes live Sepolia RPC integration tests.');
  console.error('Set TEST_RPC_URL in your shell or repo .env before running this command.');
  process.exit(1);
}
