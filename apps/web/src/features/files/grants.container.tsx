'use client';

import { FolderLock, Pencil, Plus, Trash2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import type { FormErrorContent } from '@/shared/errors/form-error';
import { useFormError } from '@/shared/errors/use-error-message';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card';
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/ui/empty';

import {
  addGrant,
  browseFolders,
  listGrants,
  removeGrant,
  updateGrant,
  type GrantRow,
} from './server/grants';
import { pathActions, type PathAction } from './files.utils';
import { GrantDialog, type FolderView, type GrantDraft } from './ui/grant-dialog';

interface GrantsContainerProps {
  subjectType: 'user' | 'group';
  subjectId: string;
  grants: readonly GrantRow[];
  canEdit: boolean;
}

/** Folder access of one user or group: the list of grants and the editor. */
export function GrantsContainer({ subjectType, subjectId, grants, canEdit }: GrantsContainerProps) {
  const t = useTranslations('files.grants');
  const toFormError = useFormError();
  const [rows, setRows] = useState(grants);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<GrantRow | null>(null);
  const [folder, setFolder] = useState<FolderView | null>(null);
  const [error, setError] = useState<FormErrorContent | null>(null);
  const [removing, setRemoving] = useState<GrantRow | null>(null);
  const [browsing, startBrowsing] = useTransition();
  const [pending, startTransition] = useTransition();
  const subject = { subjectType, subjectId };

  const browse = (path: string) => {
    startBrowsing(async () => {
      const result = await browseFolders({ path });
      setError(result.ok ? null : toFormError(result.error));
      if (result.ok) setFolder(result.data);
    });
  };

  /** Opens the dialog on a new rule, or on an existing one (starting at its folder). */
  const openEditor = (row: GrantRow | null) => {
    setError(null);
    setFolder(null);
    setEditing(row);
    setOpen(true);
    browse(row?.path ?? '/');
  };

  const submit = (draft: GrantDraft) => {
    startTransition(async () => {
      const result = editing
        ? await updateGrant({ ...subject, ...draft, id: editing.id })
        : await addGrant({ ...subject, ...draft });
      if (!result.ok) {
        setError(toFormError(result.error));
        return;
      }
      // Reload rather than guess: the new row's id comes from the database.
      const reloaded = await listGrants(subject);
      if (reloaded.ok) setRows(reloaded.data);
      toast.success(editing ? t('updated') : t('added'));
      setOpen(false);
    });
  };

  const confirmRemove = () => {
    if (!removing) return;
    startTransition(async () => {
      const result = await removeGrant({ ...subject, id: removing.id });
      if (!result.ok) {
        toast.error(toFormError(result.error).message);
        return;
      }
      setRows((current) => current.filter((row) => row.id !== removing.id));
      toast.success(t('removed'));
      setRemoving(null);
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FolderLock className="text-muted-foreground size-4" aria-hidden />
          {t('title')}
        </CardTitle>
        <CardDescription>{t(`description.${subjectType}`)}</CardDescription>
        {canEdit && (
          <CardAction>
            <Button
              size="sm"
              onClick={() => {
                openEditor(null);
              }}
            >
              <Plus aria-hidden data-icon="inline-start" />
              {t('add')}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>{t('empty.title')}</EmptyTitle>
              <EmptyDescription>{t('empty.description')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y">
            {rows.map((row) => (
              <li key={row.id} className="flex items-start gap-3 py-3 first:pt-0 last:pb-0">
                <div className="grid min-w-0 flex-1 gap-1.5">
                  <p className="flex flex-wrap items-center gap-2">
                    <code className="bg-muted truncate rounded px-1.5 py-0.5 text-xs">
                      {row.path}
                    </code>
                    <Badge variant={row.effect === 'deny' ? 'destructive' : 'default'}>
                      {t(`effects.${row.effect}`)}
                    </Badge>
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {row.actions.map((action) => (
                      <Badge key={action} variant="secondary">
                        {/* i18n-dynamic: files.grants.actionNames — stored action keys. */}
                        {t(`actionNames.${action}` as Parameters<typeof t>[0])}
                      </Badge>
                    ))}
                  </div>
                </div>
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('editLabel', { path: row.path })}
                    onClick={() => {
                      openEditor(row);
                    }}
                  >
                    <Pencil aria-hidden />
                  </Button>
                )}
                {canEdit && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('removeLabel', { path: row.path })}
                    onClick={() => {
                      setRemoving(row);
                    }}
                  >
                    <Trash2 aria-hidden />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {open && (
        <GrantDialog
          key={editing?.id ?? 'new'}
          open
          folder={folder}
          browsing={browsing}
          pending={pending}
          error={error}
          onBrowse={browse}
          onSubmit={submit}
          onOpenChange={setOpen}
          initial={
            editing
              ? {
                  path: editing.path,
                  effect: editing.effect,
                  actions: editing.actions.filter((action): action is PathAction =>
                    pathActions.some((known) => known === action),
                  ),
                }
              : undefined
          }
        />
      )}
      {removing && (
        <ConfirmDialog
          open
          title={t('confirmRemove.title', { path: removing.path })}
          description={t('confirmRemove.description')}
          confirmLabel={t('remove')}
          destructive
          pending={pending}
          onConfirm={confirmRemove}
          onOpenChange={(value) => {
            if (!value) setRemoving(null);
          }}
        />
      )}
    </Card>
  );
}
