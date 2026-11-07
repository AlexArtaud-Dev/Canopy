'use client';

import { Search, UserPlus } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';

import type { FormErrorContent } from '@/shared/errors/form-error';
import { useFormError } from '@/shared/errors/use-error-message';
import { invalidFields } from '@/features/auth/auth.utils';
import { useCan } from '@/shared/permissions/can';
import { Button } from '@/shared/ui/button';
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/ui/empty';
import { Input } from '@/shared/ui/input';

import type { ActionResult } from '@/shared/lib/action';

import {
  createUser,
  deleteUser,
  resetUserPassword,
  resetUserTwoFactor,
  revokeUserSessions,
  setUserDisabled,
  updateUser,
} from './server/user-actions';
import { ResetPasswordDialog } from './ui/reset-password-dialog';
import { UserFormDialog, type RoleChoice, type UserFormValues } from './ui/user-form-dialog';
import { UsersTable, type UserAction, type UserListItem } from './ui/users-table';
import { createUserSchema, editUserSchema, resetPasswordSchema } from './users.utils';

export interface EditableUser extends UserListItem {
  contactEmail: string | null;
}

interface UsersContainerProps {
  users: readonly EditableUser[];
  roles: readonly RoleChoice[];
  currentUserId: string;
  passwordMinLength: number;
  query: string;
  page: number;
  pages: number;
  total: number;
}

type Confirmable = Extract<UserAction, 'resetTwoFactor' | 'revokeSessions' | 'disable' | 'delete'>;

const searchDelayMs = 300;

export function UsersContainer({
  users,
  roles,
  currentUserId,
  passwordMinLength,
  query,
  page,
  pages,
  total,
}: UsersContainerProps) {
  const t = useTranslations('users');
  const router = useRouter();
  const pathname = usePathname();
  const toFormError = useFormError();
  const canCreate = useCan('users:create');
  const canUpdate = useCan('users:update');
  const canDelete = useCan('users:delete');
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(query);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<EditableUser | null>(null);
  const [resetting, setResetting] = useState<EditableUser | null>(null);
  const [confirming, setConfirming] = useState<{ action: Confirmable; user: EditableUser } | null>(
    null,
  );
  const [invalid, setInvalid] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<FormErrorContent | null>(null);

  // Debounced search kept in the URL, so it survives reloads and can be shared.
  useEffect(() => {
    if (search.trim() === query) return;
    const timer = setTimeout(() => {
      const params = new URLSearchParams();
      if (search.trim()) params.set('q', search.trim());
      router.replace(`${pathname}?${params.toString()}` as Parameters<typeof router.replace>[0]);
    }, searchDelayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [search, query, pathname, router]);

  const goToPage = (target: number) => {
    const params = new URLSearchParams();
    if (query) params.set('q', query);
    params.set('page', String(target));
    router.push(`${pathname}?${params.toString()}` as Parameters<typeof router.push>[0]);
  };

  const resetForm = () => {
    setInvalid(new Set());
    setError(null);
  };

  /** Runs an action; on success toasts, closes dialogs and refreshes the list. */
  const run = (
    action: () => Promise<ActionResult<unknown>>,
    success: string,
    close: () => void,
  ) => {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(toFormError(result.error));
        if (confirming) toast.error(toFormError(result.error).message);
        return;
      }
      toast.success(success);
      close();
      resetForm();
      router.refresh();
    });
  };

  const submitForm = (values: UserFormValues) => {
    const payload = editing ? { ...values, userId: editing.id } : values;
    const schema = editing ? editUserSchema : createUserSchema(passwordMinLength);
    const found = invalidFields(schema, payload);
    setInvalid(found);
    if (found.size > 0) return;
    const close = () => {
      setFormOpen(false);
      setEditing(null);
    };
    run(
      () => (editing ? updateUser(payload) : createUser(payload)),
      editing ? t('toasts.updated') : t('toasts.created'),
      close,
    );
  };

  const submitReset = (values: { password: string; confirmPassword: string }) => {
    if (!resetting) return;
    const payload = { ...values, userId: resetting.id };
    const found = invalidFields(resetPasswordSchema(passwordMinLength), payload);
    setInvalid(found);
    if (found.size > 0) return;
    run(
      () => resetUserPassword(payload),
      t('toasts.passwordReset'),
      () => {
        setResetting(null);
      },
    );
  };

  const confirmAction = () => {
    if (!confirming) return;
    const target = { userId: confirming.user.id };
    const actions: Record<Confirmable, [() => Promise<ActionResult<unknown>>, string]> = {
      resetTwoFactor: [() => resetUserTwoFactor(target), t('toasts.twoFactorReset')],
      revokeSessions: [() => revokeUserSessions(target), t('toasts.sessionsRevoked')],
      disable: [() => setUserDisabled(target, true), t('toasts.disabled')],
      delete: [() => deleteUser(target), t('toasts.deleted')],
    };
    const [action, success] = actions[confirming.action];
    run(action, success, () => {
      setConfirming(null);
    });
  };

  const handleAction = (action: UserAction, listed: UserListItem) => {
    const user = users.find((candidate) => candidate.id === listed.id);
    if (!user) return;
    resetForm();
    if (action === 'edit') {
      setEditing(user);
      setFormOpen(true);
    } else if (action === 'resetPassword') {
      setResetting(user);
    } else if (action === 'enable') {
      // Re-enabling is harmless: no confirmation needed.
      run(
        () => setUserDisabled({ userId: user.id }, false),
        t('toasts.enabled'),
        () => undefined,
      );
    } else {
      setConfirming({ action, user });
    }
  };

  return (
    <div className="grid gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative sm:max-w-xs sm:flex-1">
          <Search
            className="text-muted-foreground pointer-events-none absolute inset-y-0 left-2.5 my-auto size-4"
            aria-hidden
          />
          <Input
            type="search"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
            }}
            placeholder={t('search')}
            aria-label={t('search')}
            className="pl-8"
          />
        </div>
        {canCreate && (
          <Button
            className="sm:ml-auto"
            onClick={() => {
              resetForm();
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <UserPlus aria-hidden data-icon="inline-start" />
            {t('add')}
          </Button>
        )}
      </div>

      {users.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyTitle>{t('empty.title')}</EmptyTitle>
            <EmptyDescription>{t('empty.description')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="rounded-xl border">
          <UsersTable
            users={users}
            currentUserId={currentUserId}
            canUpdate={canUpdate}
            canDelete={canDelete}
            onAction={handleAction}
          />
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          {t('pagination.summary', { page, pages, total })}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => {
              goToPage(page - 1);
            }}
          >
            {t('pagination.previous')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= pages}
            onClick={() => {
              goToPage(page + 1);
            }}
          >
            {t('pagination.next')}
          </Button>
        </div>
      </div>

      <UserFormDialog
        key={editing?.id ?? 'new'}
        open={formOpen}
        editing={
          editing && {
            name: editing.name,
            displayName: editing.name,
            contactEmail: editing.contactEmail ?? '',
            roleIds: editing.roles.map((role) => role.id),
          }
        }
        roles={roles}
        passwordMinLength={passwordMinLength}
        pending={pending}
        invalidFields={invalid}
        error={error}
        onSubmit={submitForm}
        onOpenChange={(open) => {
          setFormOpen(open);
          if (!open) setEditing(null);
        }}
      />
      <ResetPasswordDialog
        name={resetting?.name ?? null}
        passwordMinLength={passwordMinLength}
        pending={pending}
        invalidFields={invalid}
        error={error}
        onSubmit={submitReset}
        onOpenChange={(open) => {
          if (!open) setResetting(null);
        }}
      />
      {confirming && (
        <ConfirmDialog
          open
          title={t(`confirm.${confirming.action}Title`, { name: confirming.user.name })}
          description={t(`confirm.${confirming.action}Description`)}
          confirmLabel={t(`actions.${confirming.action}`)}
          destructive={confirming.action !== 'revokeSessions'}
          pending={pending}
          onConfirm={confirmAction}
          onOpenChange={(open) => {
            if (!open) setConfirming(null);
          }}
        />
      )}
    </div>
  );
}
