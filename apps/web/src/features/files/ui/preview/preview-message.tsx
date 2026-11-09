import { FileQuestion } from 'lucide-react';
import type { ReactNode } from 'react';

import { Empty, EmptyContent, EmptyHeader, EmptyMedia, EmptyTitle } from '@/shared/ui/empty';

/** What the viewer shows instead of the file: unsupported, unreadable or failed to load. */
export function PreviewMessage({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <Empty className="h-full">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FileQuestion aria-hidden />
        </EmptyMedia>
        <EmptyTitle>{title}</EmptyTitle>
      </EmptyHeader>
      {action && <EmptyContent>{action}</EmptyContent>}
    </Empty>
  );
}
