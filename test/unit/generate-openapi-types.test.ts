import { describe, expect, it } from 'vitest';
import {
  readRareApiBaseUrlFromEnvFile,
  resolveRareApiBaseUrlForTypeGeneration,
} from '../../scripts/generate-openapi-types.js';

describe('generate OpenAPI types script', () => {
  it('reads RARE_API_BASE_URL from dotenv text without evaluating shell syntax', () => {
    const value = readRareApiBaseUrlFromEnvFile([
      '# comment',
      'OTHER=value',
      'RARE_API_BASE_URL="$(touch /tmp/rare-cli-should-not-run)"',
    ].join('\n'));

    expect(value).toBe('$(touch /tmp/rare-cli-should-not-run)');
  });

  it('resolves dotenv, environment, and default API base URLs', () => {
    expect(resolveRareApiBaseUrlForTypeGeneration({
      envFileContent: 'RARE_API_BASE_URL="https://api.env-file.test/"',
      processEnvValue: 'https://api.process-env.test',
    })).toBe('https://api.env-file.test');

    expect(resolveRareApiBaseUrlForTypeGeneration({
      envFileContent: 'RARE_API_BASE_URL=',
      processEnvValue: ' https://api.process-env.test/ ',
    })).toBe('https://api.process-env.test');

    expect(resolveRareApiBaseUrlForTypeGeneration({})).toBe('https://api.superrare.com');
  });
});
