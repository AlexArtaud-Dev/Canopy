'use client';

import { File, Folder } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';

import {
  strategiesFor,
  transferDecisions,
  type ConflictStrategy,
  type TransferConflict,
  type TransferOperation,
} from '../operations.utils';

interface ConflictDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  operation: TransferOperation;
  conflicts: readonly TransferConflict[];
  truncated: boolean;
  onConfirm: (choice: {
    strategy: ConflictStrategy;
    decisions: Record<string, ConflictStrategy>;
  }) => void;
}

/** Names already taken at the destination: one choice for all, refined item by item. */
export function ConflictDialog(props: ConflictDialogProps) {
  const t = useTranslations('files.browser.ops');
  const [fallback, setFallback] = useState<ConflictStrategy>('skip');
  const [choices, setChoices] = useState<Record<string, ConflictStrategy>>({});
  // i18n-dynamic: files.browser.ops.strategies
  const label = (strategy: ConflictStrategy) => t(`strategies.${strategy}`);

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('conflictsTitle', { count: props.conflicts.length })}</DialogTitle>
          <DialogDescription>{t('conflictsDescription')}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">{t('forAll')}</span>
          {(['skip', 'overwrite', 'keep_both'] as const).map((strategy) => (
            <Button
              key={strategy}
              size="sm"
              variant={fallback === strategy ? 'default' : 'outline'}
              aria-pressed={fallback === strategy}
              onClick={() => {
                setFallback(strategy);
                setChoices({});
              }}
            >
              {label(strategy)}
            </Button>
          ))}
        </div>
        <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
          {props.conflicts.map((conflict) => {
            const options = strategiesFor(conflict);
            const value = options.includes(choices[conflict.target] ?? fallback)
              ? (choices[conflict.target] ?? fallback)
              : (options[0] ?? 'skip');
            const Icon = conflict.sourceIsDirectory ? Folder : File;
            return (
              <li key={conflict.target} className="flex items-center gap-3 px-3 py-2">
                <Icon className="text-muted-foreground size-4 shrink-0" aria-hidden />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium" title={conflict.target}>
                    {conflict.target.slice(conflict.target.lastIndexOf('/') + 1)}
                  </span>
                  <span className="text-muted-foreground block truncate text-xs">
                    {conflict.self
                      ? t('selfConflict')
                      : conflict.sourceIsDirectory && conflict.targetIsDirectory
                        ? t('folderConflict')
                        : conflict.sourceIsDirectory !== conflict.targetIsDirectory
                          ? t('kindConflict')
                          : t('fileConflict')}
                  </span>
                </span>
                <Select
                  value={value}
                  disabled={options.length === 1}
                  onValueChange={(next) => {
                    setChoices((current) => ({
                      ...current,
                      [conflict.target]: next as ConflictStrategy,
                    }));
                  }}
                >
                  <SelectTrigger
                    size="sm"
                    className="w-40"
                    aria-label={t('choiceFor', { name: conflict.target })}
                  >
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {options.map((strategy) => (
                      <SelectItem key={strategy} value={strategy}>
                        {label(strategy)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </li>
            );
          })}
        </ul>
        {props.truncated && (
          <p className="text-muted-foreground text-xs">{t('conflictsTruncated')}</p>
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
            onClick={() => {
              props.onConfirm(transferDecisions(props.conflicts, choices, fallback));
            }}
          >
            {props.operation === 'copy' ? t('copyNow') : t('moveNow')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
