'use client';

import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { useFormError } from '@/shared/errors/use-error-message';
import { useCan } from '@/shared/permissions/can';

import { addGroupMembers, removeGroupMember } from './server/access-actions';
import { GroupMembers, type Person } from './ui/group-members';

export function GroupMembersContainer({
  groupId,
  members,
  candidates,
}: {
  groupId: string;
  members: readonly Person[];
  candidates: readonly Person[];
}) {
  const t = useTranslations('access.groups.membersPage');
  const router = useRouter();
  const toFormError = useFormError();
  const canEdit = useCan('groups:update');
  const [pending, startTransition] = useTransition();

  const change = (action: typeof addGroupMembers, userId: string, success: string) => {
    startTransition(async () => {
      const result = await action({ groupId, userIds: [userId] });
      if (!result.ok) {
        toast.error(toFormError(result.error).message);
        return;
      }
      toast.success(success);
      router.refresh();
    });
  };

  return (
    <GroupMembers
      members={members}
      candidates={candidates}
      canEdit={canEdit}
      pending={pending}
      onAdd={(userId) => {
        change(addGroupMembers, userId, t('added'));
      }}
      onRemove={(userId) => {
        change(removeGroupMember, userId, t('removed'));
      }}
    />
  );
}
