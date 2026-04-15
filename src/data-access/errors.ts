export class RareApiError extends Error {
  readonly status: number;
  readonly path: string;

  constructor(message: string, status: number, path: string) {
    super(`API error ${status} on ${path}: ${message}`);
    this.name = 'RareApiError';
    this.status = status;
    this.path = path;
  }
}
