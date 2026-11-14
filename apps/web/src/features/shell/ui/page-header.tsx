import type { ReactNode } from 'react';

import { Separator } from '@/shared/ui/separator';
import { SidebarTrigger } from '@/shared/ui/sidebar';
import { RemoteContainer } from '@/features/devices';

interface PageHeaderProps {
  title: string;
  actions?: ReactNode;
}

/** Sticky top bar of every page: sidebar toggle, page title and page-level actions. */
export function PageHeader({ title, actions }: PageHeaderProps) {
  return (
    <header className="bg-background/80 sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-4 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <SidebarTrigger className="-ml-1 size-9 md:size-7" />
      <Separator orientation="vertical" className="mr-1 h-4!" />
      <h1 className="truncate text-sm font-medium">{title}</h1>
      {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
      {/* There only while something plays on a screen. */}
      <RemoteContainer />
    </header>
  );
}
