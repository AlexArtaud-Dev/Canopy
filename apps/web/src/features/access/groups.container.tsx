'use client';

import { MoreHorizontal, Plus, ShieldCheck, UsersRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import type { FormErrorContent } from '@/shared/errors/form-error';
import { useFormError } from '@/shared/errors/use-error-message';
import { useCan } from '@/shared/permissions/can';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/ui/empty';
import { invalidFields } from '@/features/auth/auth.utils';

import { groupInputSchema } from './access.utils';
import { deleteGroup, saveGroup } from './server/access-actions';
import { GroupDialog, type GroupFormValues } from './ui/group-dialog';

export interface GroupItem extends GroupFormValues {
  id: string;
}

interface Option {
  id: string;
  label: string;
  hint?: string;
}

export function GroupsContainer({
  groups,
  roles,
  people,
}: {
  groups: readonly GroupItem[];
  roles: readonly Option[];
  people: readonly Option[];
}) {
  const t = useTranslations('access.groups');
  const router = useRouter();
  const toFormError = useFormError();
  const canCreate = useCan('groups:create');
  const canUpdate = useCan('groups:update');
  const canDelete = useCan('groups:delete');
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<{ group: GroupItem | null } | null>(null);
  const [deleting, setDeleting] = useState<GroupItem | null>(null);
  const [invalid, setInvalid] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<FormErrorContent | null>(null);
  const roleLabels = new Map(roles.map((role) => [role.id, role.label]));

  const openDialog = (group: GroupItem | null) => {
    setInvalid(new Set());
    setError(null);
    setDialog({ group });
  };

  const submit = (values: GroupFormValues) => {
    const payload = { ...values, groupId: dialog?.group?.id };
    const found = invalidFields(groupInputSchema, payload);
    setInvalid(found);
    if (found.size > 0) return;
    startTransition(async () => {
      const result = await saveGroup(payload);
      if (!result.ok) {
        setError(toFormError(result.error));
        return;
      }
      toast.success(t('toasts.saved'));
      setDialog(null);
      router.refresh();
    });
  };

  const confirmDelete = () => {
    if (!deleting) return;
    startTransition(async () => {
      const result = await deleteGroup({ id: deleting.id });
      if (!result.ok) {
        toast.error(toFormError(result.error).message);
        return;
      }
      toast.success(t('toasts.deleted'));
      setDeleting(null);
      router.refresh();
    });
  };

  return (
    <div className="grid gap-4">
      {canCreate && (
        <Button
          className="justify-self-end"
          onClick={() => {
            openDialog(null);
          }}
        >
          <Plus aria-hidden data-icon="inline-start" />
          {t('add')}
        </Button>
      )}
      {groups.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyTitle>{t('empty.title')}</EmptyTitle>
            <EmptyDescription>{t('empty.description')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {groups.map((group) => (
            <li key={group.id} className="bg-card flex gap-3 rounded-xl border p-4">
              <span className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg">
                <UsersRound className="text-muted-foreground size-4" aria-hidden />
              </span>
              <div className="grid min-w-0 flex-1 gap-1.5">
                <p className="flex items-center gap-2 font-medium">
                  <span className="truncate">{group.name}</span>
                  {group.requireTwoFactor && (
                    <Badge variant="outline" className="gap-1">
                      <ShieldCheck aria-hidden />
                      {t('requireTwoFactor')}
                    </Badge>
                  )}
                </p>
                {group.description && (
                  <p className="text-muted-foreground line-clamp-2 text-sm">{group.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-1">
                  <span className="text-muted-foreground mr-1 text-xs">
                    {t('members', { count: group.memberIds.length })}
                  </span>
                  {group.roleIds.length === 0 ? (
                    <span className="text-muted-foreground text-xs">· {t('noRoles')}</span>
                  ) : (
                    group.roleIds.map((roleId) => (
                      <Badge key={roleId} variant="secondary">
                        {roleLabels.get(roleId) ?? roleId}
                      </Badge>
                    ))
                  )}
                </div>
              </div>
              {(canUpdate || canDelete) && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      aria-label={t('menu', { name: group.name })}
                    >
                      <MoreHorizontal aria-hidden />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {canUpdate && (
                      <DropdownMenuItem
                        onSelect={() => {
                          openDialog(group);
                        }}
                      >
                        {t('edit')}
                      </DropdownMenuItem>
                    )}
                    {canDelete && (
                      <DropdownMenuItem
                        variant="destructive"
                        onSelect={() => {
                          setDeleting(group);
                        }}
                      >
                        {t('delete')}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
            </li>
          ))}
        </ul>
      )}
      {dialog && (
        <GroupDialog
          key={dialog.group?.id ?? 'new'}
          open
          editing={dialog.group}
          roles={roles}
          people={people}
          pending={pending}
          invalidFields={invalid}
          error={error}
          onSubmit={submit}
          onOpenChange={(open) => {
            if (!open) setDialog(null);
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          open
          title={t('confirmDelete.title', { name: deleting.name })}
          description={t('confirmDelete.description')}
          confirmLabel={t('delete')}
          destructive
          pending={pending}
          onConfirm={confirmDelete}
          onOpenChange={(open) => {
            if (!open) setDeleting(null);
          }}
        />
      )}
    </div>
  );
}
