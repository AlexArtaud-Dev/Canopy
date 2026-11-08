'use client';

import { ChevronRight, Folder } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';

import type { FormErrorContent } from '@/shared/errors/form-error';
import { FormError } from '@/shared/errors/form-error';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Spinner } from '@/shared/ui/spinner';

import { breadcrumbs, type PathAction } from '../files.utils';
import { canDropInto, type TransferOperation } from '../operations.utils';

export interface PickerFolder {
  name: string;
  path: string;
}

export type FolderLoader = (
  path: string,
) => Promise<
  | { ok: true; path: string; actions: PathAction[]; folders: PickerFolder[] }
  | { ok: false; error: FormErrorContent }
>;

interface FolderPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operation: TransferOperation;
  sources: readonly string[];
  startPath: string;
  loadFolders: FolderLoader;
  onConfirm: (destination: string) => void;
}

/** "Copy to…" / "Move to…": browse folders and pick one that accepts the items. */
export function FolderPickerDialog(props: FolderPickerDialogProps) {
  const t = useTranslations('files.browser.ops');
  const browserT = useTranslations('files.browser');
  const { loadFolders, open, startPath } = props;
  const [path, setPath] = useState(startPath);
  const [actions, setActions] = useState<PathAction[]>([]);
  const [folders, setFolders] = useState<PickerFolder[]>([]);
  const [error, setError] = useState<FormErrorContent | null>(null);
  const [loading, startLoading] = useTransition();

  const browse = (target: string) => {
    startLoading(async () => {
      const result = await loadFolders(target);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setError(null);
      setPath(result.path);
      setActions(result.actions);
      setFolders(result.folders);
    });
  };

  useEffect(() => {
    if (open) browse(startPath);
    // Reload only when the dialog opens; navigation inside it is user-driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const allowed = actions.includes('create') && canDropInto(props.sources, path, props.operation);
  const title = props.operation === 'copy' ? t('copyTitle') : t('moveTitle');

  return (
    <Dialog open={open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {t('pickDescription', { count: props.sources.length })}
          </DialogDescription>
        </DialogHeader>
        {error && <FormError error={error} />}
        <nav
          aria-label={browserT('breadcrumbs')}
          className="flex flex-wrap items-center gap-0.5 text-sm"
        >
          {breadcrumbs(path).map((crumb, index, all) => (
            <span key={crumb.path} className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="xs"
                disabled={loading || index === all.length - 1}
                onClick={() => {
                  browse(crumb.path);
                }}
              >
                {crumb.path === '/' ? browserT('root') : crumb.name}
              </Button>
              {index < all.length - 1 && (
                <ChevronRight className="text-muted-foreground size-3" aria-hidden />
              )}
            </span>
          ))}
        </nav>
        <div className="h-64 overflow-y-auto rounded-lg border" aria-busy={loading}>
          {loading ? (
            <p className="text-muted-foreground flex items-center gap-2 p-3 text-sm">
              <Spinner />
              {t('loadingFolders')}
            </p>
          ) : folders.length === 0 ? (
            <p className="text-muted-foreground p-3 text-sm">{t('noSubfolders')}</p>
          ) : (
            <ul className="divide-y">
              {folders.map((folder) => (
                <li key={folder.path}>
                  <button
                    type="button"
                    className="hover:bg-muted flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm"
                    onClick={() => {
                      browse(folder.path);
                    }}
                  >
                    <Folder className="fill-primary/15 text-primary size-4" aria-hidden />
                    <span className="truncate">{folder.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {!loading && !allowed && (
          <p className="text-muted-foreground text-xs">{t('cannotDropHere')}</p>
        )}
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => {
              props.onOpenChange(false);
            }}
          >
            {t('cancel')}
          </Button>
          <Button
            disabled={loading || !allowed}
            onClick={() => {
              props.onConfirm(path);
            }}
          >
            {props.operation === 'copy' ? t('copyHere') : t('moveHere')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
