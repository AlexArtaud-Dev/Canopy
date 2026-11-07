import type { ReactNode } from 'react';

import { BrandMark } from '@/features/shell';

// Signed-out pages: one centered column, no navigation.
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="bg-muted/40 flex min-h-svh flex-col items-center justify-center gap-8 p-4 sm:p-6">
      <div className="flex items-center gap-2.5">
        <span className="bg-primary text-primary-foreground flex size-9 items-center justify-center rounded-lg">
          <BrandMark className="size-5" />
        </span>
        <span className="text-lg font-semibold tracking-tight">Canopy</span>
      </div>
      <main className="flex w-full justify-center">{children}</main>
    </div>
  );
}
