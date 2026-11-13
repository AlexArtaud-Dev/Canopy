'use client';

import { ChevronRight, File, Folder } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';

import { cn } from 'cn';
import { useErrorMessage } from '@/shared/errors/use-error-message';
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
import { breadcrumbs } from '@/features/files/files.utils';

import { pickerEntries, type PickerEntry } from '../commands.utils';
import { loadPickerFolder } from '../model/load-picker-folder';

interface PathPickerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The field being filled, named in the title. */
  field: string;
  pick: 'file' | 'folder';
  extensions?: readonly string[] | undefined;
  startPath: string;
  onPick: (path: string) => void;
}

/** Browse the folders the person may see and pick a file (of the accepted kinds) or a folder. */
export function PathPickerDialog(props: PathPickerDialogProps) {
  const t = useTranslations('commands.page.picker');
  const errorMessage = useErrorMessage();
  const { open, startPath, pick } = props;
  const [path, setPath] = useState(startPath);
  const [entries, setEntries] = useState<PickerEntry[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();

  const browse = (target: string) => {
    startLoading(async () => {
      const result = await loadPickerFolder(target);
      if (!result.ok) {
        // A folder that went away: start again from the root rather than stay stuck.
        if (target !== '/' && result.code.startsWith('files.')) {
          browse('/');
          return;
        }
        setError(errorMessage(result.code, result.params));
        return;
      }
      setError(null);
      setChosen(null);
      setPath(result.path);
      setEntries(pickerEntries(result.entries, pick, props.extensions));
      setTruncated(result.truncated);
    });
  };

  useEffect(() => {
    if (open) browse(startPath);
    // Reload only when the dialog opens; navigation inside it is the person's.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const confirm = (target: string) => {
    props.onPick(target);
    props.onOpenChange(false);
  };
  const selection = pick === 'folder' ? path : chosen;

  return (
    <Dialog open={open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{pick === 'file' ? t('fileTitle') : t('folderTitle')}</DialogTitle>
          <DialogDescription>{props.field}</DialogDescription>
        </DialogHeader>
        <nav aria-label={t('location')} className="flex flex-wrap items-center gap-0.5 text-sm">
          {breadcrumbs(path).map((crumb, index, all) => (
            <span key={crumb.path} className="flex items-center gap-0.5">
              <Button
                type="button"
                variant="ghost"
                size="xs"
                disabled={loading || index === all.length - 1}
                onClick={() => {
                  browse(crumb.path);
                }}
              >
                {crumb.path === '/' ? t('root') : crumb.name}
              </Button>
              {index < all.length - 1 && (
                <ChevronRight className="text-muted-foreground size-3" aria-hidden />
              )}
            </span>
          ))}
        </nav>
        <div className="h-72 overflow-y-auto rounded-lg border" aria-busy={loading}>
          {loading ? (
            <p className="text-muted-foreground flex items-center gap-2 p-3 text-sm">
              <Spinner />
              {t('loading')}
            </p>
          ) : error !== null ? (
            <p role="alert" className="text-destructive p-3 text-sm">
              {error}
            </p>
          ) : entries.length === 0 ? (
            <p className="text-muted-foreground p-3 text-sm">
              {pick === 'file' ? t('noFile') : t('noFolder')}
            </p>
          ) : (
            <ul className="divide-y">
              {entries.map((entry) => (
                <li key={entry.path}>
                  <button
                    type="button"
                    aria-pressed={entry.isDirectory ? undefined : entry.path === chosen}
                    className={cn(
                      'hover:bg-muted flex min-h-11 w-full items-center gap-2 px-3 text-left text-sm',
                      entry.path === chosen && 'bg-accent',
                    )}
                    onClick={() => {
                      if (entry.isDirectory) browse(entry.path);
                      else setChosen(entry.path);
                    }}
                    onDoubleClick={() => {
                      if (!entry.isDirectory) confirm(entry.path);
                    }}
                  >
                    {entry.isDirectory ? (
                      <Folder
                        className="fill-primary/15 text-primary size-4 shrink-0"
                        aria-hidden
                      />
                    ) : (
                      <File className="text-muted-foreground size-4 shrink-0" aria-hidden />
                    )}
                    <span className="truncate">{entry.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {truncated && <p className="text-muted-foreground text-xs">{t('truncated')}</p>}
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              props.onOpenChange(false);
            }}
          >
            {t('cancel')}
          </Button>
          <Button
            type="button"
            disabled={loading || selection === null || error !== null}
            onClick={() => {
              if (selection !== null) confirm(selection);
            }}
          >
            {pick === 'file' ? t('pickFile') : t('pickFolder')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
