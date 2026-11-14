'use client';

import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { cn } from 'cn';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/shared/ui/sheet';

import type { MenuNode } from './entry-actions';

interface ActionSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  nodes: readonly MenuNode[];
}

/**
 * An entry's actions on a phone: a sheet rising from the bottom, every action a full-width row
 * within thumb reach, groups (compress, plugins…) unfolding in place rather than in menus that
 * would leave the screen.
 */
export function ActionSheet({ open, onOpenChange, title, description, nodes }: ActionSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85dvh] gap-0 overflow-y-auto rounded-t-xl pb-[max(0.5rem,env(safe-area-inset-bottom))]"
      >
        <SheetHeader className="border-b pb-3">
          <SheetTitle className="truncate pr-8">{title}</SheetTitle>
          {description && <SheetDescription className="truncate">{description}</SheetDescription>}
        </SheetHeader>
        <ul className="py-1">
          {nodes.map((node) => (
            <SheetNode
              key={node.key}
              node={node}
              depth={0}
              close={() => {
                onOpenChange(false);
              }}
            />
          ))}
        </ul>
      </SheetContent>
    </Sheet>
  );
}

function SheetNode({ node, depth, close }: { node: MenuNode; depth: number; close: () => void }) {
  const [unfolded, setUnfolded] = useState(false);
  if (node.kind === 'separator') return <li role="separator" className="my-1 border-t" />;
  const Icon = node.icon;
  const row = cn(
    'hover:bg-muted flex min-h-12 w-full items-center gap-3 px-4 text-left text-sm',
    depth > 0 && 'pl-11',
    depth > 1 && 'pl-16',
  );
  if (node.kind === 'item') {
    return (
      <li>
        <button
          type="button"
          className={cn(row, node.destructive && 'text-destructive')}
          onClick={() => {
            // Close first: the action may open a dialog of its own.
            close();
            node.onSelect();
          }}
        >
          {Icon ? <Icon aria-hidden className="size-4 shrink-0" /> : <span className="size-4" />}
          <span className="min-w-0 flex-1 truncate">{node.label}</span>
        </button>
      </li>
    );
  }
  return (
    <li>
      <button
        type="button"
        aria-expanded={unfolded}
        className={row}
        onClick={() => {
          setUnfolded((value) => !value);
        }}
      >
        {Icon ? <Icon aria-hidden className="size-4 shrink-0" /> : <span className="size-4" />}
        <span className="min-w-0 flex-1 truncate">{node.label}</span>
        <ChevronRight
          aria-hidden
          className={cn(
            'text-muted-foreground size-4 transition-transform',
            unfolded && 'rotate-90',
          )}
        />
      </button>
      {unfolded && (
        <ul>
          {node.items.map((child) => (
            <SheetNode key={child.key} node={child} depth={depth + 1} close={close} />
          ))}
        </ul>
      )}
    </li>
  );
}
