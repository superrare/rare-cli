import { extname } from 'node:path';

/** Infer supported print formats; other file types can use an explicit MIME type. */
export function resolveUploadContentType(filename: string, explicitContentType?: string): string {
  if (explicitContentType !== undefined) return explicitContentType;
  const extension = extname(filename).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}
