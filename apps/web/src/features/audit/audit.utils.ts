export type AuditResult = 'success' | 'denied' | 'error';

// Deliberately not `key` or `code`: setting keys and error codes are useful audit context.
const sensitiveKeyPattern =
  /pass(word|phrase)?|secret|token|api_?key|private_?key|otp|cookie|authorization/i;
const maxMetaBytes = 8 * 1024;
const actionPattern = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9_]*$/;

export function isAuditAction(action: string): boolean {
  return actionPattern.test(action);
}

function redact(value: unknown, depth: number): unknown {
  if (depth > 4) return '[depth]';
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => redact(item, depth + 1));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [
        key,
        sensitiveKeyPattern.test(key) ? '[redacted]' : redact(child, depth + 1),
      ]),
    );
  }
  if (typeof value === 'string' && value.length > 512) return `${value.slice(0, 512)}…`;
  return value;
}

/**
 * Makes metadata safe to persist forever: secrets-looking keys are redacted, long strings and
 * arrays truncated, nesting capped, and the whole object bounded to 8 KiB. File contents must
 * never be passed in the first place; this is the safety net, not the policy.
 */
export function sanitizeMeta(meta: Readonly<Record<string, unknown>>): Record<string, unknown> {
  const redacted = redact(meta, 0) as Record<string, unknown>;
  const size = Buffer.byteLength(JSON.stringify(redacted), 'utf8');
  return size > maxMetaBytes ? { truncated: true, originalBytes: size } : redacted;
}
