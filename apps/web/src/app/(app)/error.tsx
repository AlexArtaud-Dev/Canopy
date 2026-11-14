'use client';

import { ErrorState } from '@/shared/errors/error-state';
import { useStaleVersionRecovery } from '@/shared/errors/stale-version';

// Server errors reach the browser without their message (production) — only the digest, which
// `onRequestError` logs server-side, so the reference shown here links both.
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  // Canopy updated while the page was open: it reloads itself instead of failing.
  const code = useStaleVersionRecovery(error);
  return (
    <main className="flex flex-1 p-4 md:p-6">
      <ErrorState code={code} reference={error.digest} onRetry={reset} />
    </main>
  );
}
