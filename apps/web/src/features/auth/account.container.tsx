'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import type { FormErrorContent } from '@/shared/errors/form-error';
import { useFormError } from '@/shared/errors/use-error-message';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/shared/ui/alert-dialog';

import { changePasswordSchema, profileSchema } from './account.utils';
import { invalidFields } from './auth.utils';
import {
  changePassword,
  revokeOtherSessions,
  revokeSession,
  updateProfile,
} from './server/account';
import { PasswordCard, type PasswordValues } from './ui/password-card';
import { ProfileCard, type ProfileValues } from './ui/profile-card';
import { SessionsCard, type SessionItem } from './ui/sessions-card';

interface AccountContainerProps {
  username: string;
  profile: ProfileValues;
  passwordMinLength: number;
  sessions: readonly SessionItem[];
}

/** Profile, password and sessions sections of the Account page. */
export function AccountContainer({
  username,
  profile,
  passwordMinLength,
  sessions,
}: AccountContainerProps) {
  const t = useTranslations('auth');
  const router = useRouter();
  const toFormError = useFormError();
  const [profilePending, startProfile] = useTransition();
  const [passwordPending, startPassword] = useTransition();
  const [sessionsPending, startSessions] = useTransition();
  const [profileInvalid, setProfileInvalid] = useState<ReadonlySet<string>>(new Set());
  const [profileError, setProfileError] = useState<FormErrorContent | null>(null);
  const [passwordInvalid, setPasswordInvalid] = useState<ReadonlySet<string>>(new Set());
  const [passwordError, setPasswordError] = useState<FormErrorContent | null>(null);
  const [confirmOthers, setConfirmOthers] = useState(false);

  const saveProfile = (values: ProfileValues) => {
    const invalid = invalidFields(profileSchema, values);
    setProfileInvalid(invalid);
    if (invalid.size > 0) return;
    startProfile(async () => {
      const result = await updateProfile(values);
      setProfileError(result.ok ? null : toFormError(result.error));
      if (!result.ok) return;
      toast.success(t('profile.saved'));
      router.refresh();
    });
  };

  const savePassword = (values: PasswordValues) =>
    new Promise<boolean>((resolve) => {
      const invalid = invalidFields(changePasswordSchema(passwordMinLength), values);
      setPasswordInvalid(invalid);
      if (invalid.size > 0) {
        resolve(false);
        return;
      }
      startPassword(async () => {
        const result = await changePassword(values);
        setPasswordError(result.ok ? null : toFormError(result.error));
        resolve(result.ok);
        if (!result.ok) return;
        toast.success(t('passwordChange.changed', { count: result.data.endedSessions }));
        router.refresh();
      });
    });

  const runSessionAction = (action: () => Promise<{ ok: boolean }>) => {
    startSessions(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(t('sessions.failed'));
        return;
      }
      router.refresh();
    });
  };

  return (
    <>
      <ProfileCard
        username={username}
        values={profile}
        pending={profilePending}
        invalidFields={profileInvalid}
        error={profileError}
        onSubmit={saveProfile}
      />
      <PasswordCard
        passwordMinLength={passwordMinLength}
        pending={passwordPending}
        invalidFields={passwordInvalid}
        error={passwordError}
        onSubmit={savePassword}
      />
      <SessionsCard
        sessions={sessions}
        pending={sessionsPending}
        onRevoke={(sessionId) => {
          runSessionAction(() => revokeSession({ sessionId }));
        }}
        onRevokeOthers={() => {
          setConfirmOthers(true);
        }}
      />
      <AlertDialog open={confirmOthers} onOpenChange={setConfirmOthers}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('sessions.confirmTitle')}</AlertDialogTitle>
            <AlertDialogDescription>{t('sessions.confirmDescription')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('totp.cancel')}</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => {
                runSessionAction(revokeOtherSessions);
              }}
            >
              {t('sessions.revokeOthers')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
