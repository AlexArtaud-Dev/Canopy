/**
 * Base class for every application error. The `code` is what reaches the UI, which shows its
 * translation (`errors.<code>`); the message is for logs only and is never displayed.
 */
export class AppBaseError extends Error {
  readonly code: string;
  readonly params: Readonly<Record<string, string | number>>;

  constructor(
    code: string,
    message: string,
    options?: { params?: Record<string, string | number>; cause?: unknown },
  ) {
    super(message, { cause: options?.cause });
    this.name = new.target.name;
    this.code = code;
    this.params = options?.params ?? {};
  }
}
