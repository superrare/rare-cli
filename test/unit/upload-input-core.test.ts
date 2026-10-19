import { describe, expect, it } from 'vitest';
import { resolveUploadContentType } from '../../src/commands/upload-input-core.js';

describe('upload content type', () => {
  it('recognizes supported print file extensions without case sensitivity', () => {
    expect(resolveUploadContentType('/images/master.png')).toBe('image/png');
    expect(resolveUploadContentType('/images/master.PNG')).toBe('image/png');
    expect(resolveUploadContentType('/images/master.jpg')).toBe('image/jpeg');
    expect(resolveUploadContentType('/images/master.JPEG')).toBe('image/jpeg');
  });

  it('preserves an explicit content type and keeps generic files as binary', () => {
    expect(resolveUploadContentType('master.png', 'image/jpeg')).toBe('image/jpeg');
    expect(resolveUploadContentType('document.pdf', 'application/pdf')).toBe('application/pdf');
    expect(resolveUploadContentType('unknown.bin')).toBe('application/octet-stream');
  });
});
