'use client';

import { KeyRound, MoreHorizontal, Plus } from 'lucide-react';
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
import { invalidFields } from '@/features/auth/auth.utils';

import { allPermissions, roleInputSchema, type PermissionRow } from './access.utils';
import { deleteRole, saveRole } from './server/access-actions';
import { RoleDialog, type RoleFormValues } from './ui/role-dialog';

export interface RoleItem {
  id: string;
  label: string;
  builtIn: boolean;
  name: string;
  description: string;
  permissions: string[];
  userCount: number;
  groupCount: number;
}

export function RolesContainer({
  roles,
  matrix,
}: {
  roles: readonly RoleItem[];
  matrix: readonly PermissionRow[];
}) {
  const t = useTranslations('access.roles');
  const router = useRouter();
  const toFormError = useFormError();
  const canCreate = useCan('roles:create');
  const canUpdate = useCan('roles:update');
  const canDelete = useCan('roles:delete');
  const [pending, startTransition] = useTransition();
  const [dialog, setDialog] = useState<{ role: RoleItem | null } | null>(null);
  const [deleting, setDeleting] = useState<RoleItem | null>(null);
  const [invalid, setInvalid] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<FormErrorContent | null>(null);

  const openDialog = (role: RoleItem | null) => {
    setInvalid(new Set());
    setError(null);
    setDialog({ role });
  };

  const submit = (values: RoleFormValues) => {
    const payload = { ...values, roleId: dialog?.role?.id };
    const found = invalidFields(roleInputSchema, payload);
    setInvalid(found);
    if (found.size > 0) return;
    startTransition(async () => {
      const result = await saveRole(payload);
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
      const result = await deleteRole({ id: deleting.id });
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
      <ul className="grid gap-3 sm:grid-cols-2">
        {roles.map((role) => (
          <li key={role.id} className="bg-card flex gap-3 rounded-xl border p-4">
            <span className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg">
              <KeyRound className="text-muted-foreground size-4" aria-hidden />
            </span>
            <div className="grid min-w-0 flex-1 gap-1">
              <p className="flex items-center gap-2 font-medium">
                <span className="truncate">{role.label}</span>
                {role.builtIn && <Badge variant="outline">{t('builtIn')}</Badge>}
              </p>
              {role.description && (
                <p className="text-muted-foreground line-clamp-2 text-sm">{role.description}</p>
              )}
              <p className="text-muted-foreground text-xs">
                {role.permissions.includes(allPermissions)
                  ? t('allPermissions')
                  : t('permissionCount', { count: role.permissions.length })}
                {' · '}
                {t('usage', { users: role.userCount, groups: role.groupCount })}
              </p>
            </div>
            {(canUpdate || (canDelete && !role.builtIn)) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('menu', { name: role.label })}
                  >
                    <MoreHorizontal aria-hidden />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  {canUpdate && (
                    <DropdownMenuItem
                      onSelect={() => {
                        openDialog(role);
                      }}
                    >
                      {t('edit')}
                    </DropdownMenuItem>
                  )}
                  {canDelete && !role.builtIn && (
                    <DropdownMenuItem
                      variant="destructive"
                      onSelect={() => {
                        setDeleting(role);
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
      {dialog && (
        <RoleDialog
          key={dialog.role?.id ?? 'new'}
          open
          editing={
            dialog.role && {
              label: dialog.role.label,
              builtIn: dialog.role.builtIn,
              values: {
                name: dialog.role.name,
                description: dialog.role.description,
                permissions: dialog.role.permissions,
              },
            }
          }
          matrix={matrix}
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
          title={t('confirmDelete.title', { name: deleting.label })}
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
