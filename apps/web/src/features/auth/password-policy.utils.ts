import { createHash } from 'node:crypto';

/** SHA-1 split for the Pwned Passwords range API: 5-char prefix sent, suffix matched locally. */
export function pwnedRangeQuery(password: string): { prefix: string; suffix: string } {
  const digest = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase();
  return { prefix: digest.slice(0, 5), suffix: digest.slice(5) };
}

/** True when the range response (`SUFFIX:COUNT` lines) lists the suffix with a non-zero count. */
export function isSuffixBreached(rangeBody: string, suffix: string): boolean {
  return rangeBody.split(/\r?\n/).some((line) => {
    const [candidate, count] = line.trim().split(':');
    return candidate?.toUpperCase() === suffix && Number(count) > 0;
  });
}
