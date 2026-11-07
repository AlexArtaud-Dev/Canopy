'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';

import type { FormErrorContent } from '@/shared/errors/form-error';
import { useFormError } from '@/shared/errors/use-error-message';

import { signOut } from './server/sign-out';
import { verifyTwoFactor } from './server/two-factor';
import { TwoFactorForm } from './ui/two-factor-form';

export function TwoFactorContainer({ next }: { next: string | undefined }) {
  const router = useRouter();
  const toFormError = useFormError();
  const [error, setError] = useState<FormErrorContent | null>(null);
  const [pending, startTransition] = useTransition();

  const handleSubmit = (code: string) => {
    startTransition(async () => {
      const result = await verifyTwoFactor({ code, next });
      if (!result.ok) {
        setError(toFormError(result.error));
        return;
      }
      // `redirectTo` was reduced to a same-origin path by the server.
      router.replace(result.data.redirectTo as Parameters<typeof router.replace>[0]);
      router.refresh();
    });
  };

  return (
    <TwoFactorForm
      pending={pending}
      error={error}
      onSubmit={handleSubmit}
      onCancel={() => {
        startTransition(() => signOut());
      }}
    />
  );
}
