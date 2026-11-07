'use client';

import { ChevronRight, Folder, FolderOpen } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import type { FormErrorContent } from '@/shared/errors/form-error';
import { FormError } from '@/shared/errors/form-error';
import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/shared/ui/field';
import { Spinner } from '@/shared/ui/spinner';

import { actionPresets, breadcrumbs, pathActions, type PathAction } from '../files.utils';

export interface FolderView {
  path: string;
  folders: { name: string; path: string }[];
}

export interface GrantDraft {
  path: string;
  actions: PathAction[];
  effect: 'allow' | 'deny';
}

interface GrantDialogProps {
  open: boolean;
  folder: FolderView | null;
  browsing: boolean;
  pending: boolean;
  error: FormErrorContent | null;
  onBrowse: (path: string) => void;
  onSubmit: (draft: GrantDraft) => void;
  onOpenChange: (open: boolean) => void;
}

export function GrantDialog({
  open,
  folder,
  browsing,
  pending,
  error,
  onBrowse,
  onSubmit,
  onOpenChange,
}: GrantDialogProps) {
  const t = useTranslations('files.grants');
  const [effect, setEffect] = useState<'allow' | 'deny'>('allow');
  const [actions, setActions] = useState<ReadonlySet<PathAction>>(new Set(actionPresets.readOnly));
  const current = folder?.path ?? '/';

  const toggle = (action: PathAction, checked: boolean) => {
    setActions((previous) => {
      const next = new Set(previous);
      if (checked) next.add(action);
      else next.delete(action);
      return next;
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t('dialogTitle')}</DialogTitle>
          <DialogDescription>{t('dialogDescription')}</DialogDescription>
        </DialogHeader>
        <FieldGroup>
          {error && <FormError error={error} />}
          <FieldSet>
            <FieldLegend variant="label">{t('folder')}</FieldLegend>
            <nav aria-label={t('folder')} className="flex flex-wrap items-center gap-0.5 text-sm">
              {breadcrumbs(current).map((crumb, index, all) => (
                <span key={crumb.path} className="flex items-center gap-0.5">
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    disabled={browsing || index === all.length - 1}
                    aria-current={index === all.length - 1 ? 'location' : undefined}
                    onClick={() => {
                      onBrowse(crumb.path);
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
            <div className="max-h-56 overflow-y-auto rounded-lg border" aria-busy={browsing}>
              {browsing && (
                <div className="text-muted-foreground flex items-center gap-2 p-3 text-sm">
                  <Spinner />
                  {t('loading')}
                </div>
              )}
              {!browsing && folder?.folders.length === 0 && (
                <p className="text-muted-foreground p-3 text-sm">{t('noSubfolders')}</p>
              )}
              {!browsing && (
                <ul className="divide-y">
                  {folder?.folders.map((child) => (
                    <li key={child.path}>
                      <button
                        type="button"
                        className="hover:bg-muted focus-visible:bg-muted flex w-full items-center gap-2 px-3 py-2 text-left text-sm outline-none"
                        onClick={() => {
                          onBrowse(child.path);
                        }}
                      >
                        <Folder className="text-muted-foreground size-4" aria-hidden />
                        <span className="truncate">{child.name}</span>
                        <ChevronRight
                          className="text-muted-foreground ml-auto size-4"
                          aria-hidden
                        />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <p className="flex items-center gap-2 text-sm">
              <FolderOpen className="text-muted-foreground size-4" aria-hidden />
              {t('selected')}{' '}
              <code className="bg-muted rounded px-1.5 py-0.5 text-xs">{current}</code>
            </p>
          </FieldSet>

          <FieldSet>
            <FieldLegend variant="label">{t('effect')}</FieldLegend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(['allow', 'deny'] as const).map((choice) => (
                <Button
                  key={choice}
                  type="button"
                  variant="outline"
                  aria-pressed={effect === choice}
                  className={
                    effect === choice
                      ? 'border-primary bg-primary/10 dark:border-primary dark:bg-primary/15 h-auto justify-start py-2.5'
                      : 'h-auto justify-start py-2.5'
                  }
                  onClick={() => {
                    setEffect(choice);
                  }}
                >
                  {t(`effects.${choice}`)}
                </Button>
              ))}
            </div>
          </FieldSet>

          <FieldSet>
            <FieldLegend variant="label">{t('actions')}</FieldLegend>
            <div className="flex flex-wrap gap-2">
              {(Object.keys(actionPresets) as (keyof typeof actionPresets)[]).map((preset) => (
                <Button
                  key={preset}
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setActions(new Set(actionPresets[preset]));
                  }}
                >
                  {t(`presets.${preset}`)}
                </Button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {pathActions.map((action) => (
                <Field key={action} orientation="horizontal">
                  <Checkbox
                    id={`grant-${action}`}
                    checked={actions.has(action)}
                    onCheckedChange={(checked) => {
                      toggle(action, checked === true);
                    }}
                  />
                  <FieldLabel htmlFor={`grant-${action}`} className="font-normal">
                    {t(`actionNames.${action}`)}
                  </FieldLabel>
                </Field>
              ))}
            </div>
          </FieldSet>
        </FieldGroup>
        <DialogFooter>
          <Button
            disabled={pending || actions.size === 0}
            onClick={() => {
              onSubmit({ path: current, effect, actions: [...actions] });
            }}
          >
            {pending && <Spinner />}
            {t('add')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
