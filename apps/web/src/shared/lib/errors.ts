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

/** Wire shape of every error shown to users — mirrors the engine's `Error` schema. */
export interface ErrorDto {
  code: string;
  params: Readonly<Record<string, string | number>>;
  requestId: string;
}

export const unexpectedErrorCode = 'system.unexpected';

/** `<module>.<error>` in lower snake case, as declared by the contract. */
const errorCodePattern = /^[a-z]+\.[a-z_]+$/;

export function isErrorCode(value: string): boolean {
  return errorCodePattern.test(value);
}

/**
 * Maps anything thrown to a safe DTO: known errors keep their code and params, everything else
 * (including malformed codes) becomes `system.unexpected` so internals never leak to the UI.
 */
export function toErrorDto(error: unknown, requestId: string): ErrorDto {
  if (error instanceof AppBaseError && isErrorCode(error.code)) {
    return { code: error.code, params: error.params, requestId };
  }
  return { code: unexpectedErrorCode, params: {}, requestId };
}
