'use client';

import { MoreHorizontal, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useNow, useTranslations } from 'next-intl';

import { Avatar, AvatarFallback } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

export interface UserListItem {
  id: string;
  username: string;
  name: string;
  initials: string;
  disabled: boolean;
  twoFactor: boolean;
  lastActiveAt: string | null;
  roles: { id: string; label: string }[];
}

export type UserAction =
  | 'edit'
  | 'resetPassword'
  | 'resetLink'
  | 'exportData'
  | 'resetTwoFactor'
  | 'revokeSessions'
  | 'disable'
  | 'enable'
  | 'delete';

interface UsersTableProps {
  users: readonly UserListItem[];
  currentUserId: string;
  canUpdate: boolean;
  canDelete: boolean;
  onAction: (action: UserAction, user: UserListItem) => void;
}

export function UsersTable({
  users,
  currentUserId,
  canUpdate,
  canDelete,
  onAction,
}: UsersTableProps) {
  const t = useTranslations('users');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t('columns.user')}</TableHead>
          <TableHead className="hidden md:table-cell">{t('columns.roles')}</TableHead>
          <TableHead>{t('columns.status')}</TableHead>
          <TableHead className="hidden lg:table-cell">{t('columns.lastActive')}</TableHead>
          <TableHead className="w-10" />
        </TableRow>
      </TableHeader>
      <TableBody>
        {users.map((user) => {
          const self = user.id === currentUserId;
          return (
            <TableRow key={user.id} data-state={user.disabled ? 'disabled' : undefined}>
              <TableCell>
                <div className="flex items-center gap-3">
                  <Avatar className="size-8 rounded-lg">
                    <AvatarFallback className="rounded-lg text-xs">{user.initials}</AvatarFallback>
                  </Avatar>
                  <div className="grid min-w-0 leading-tight">
                    <span className="truncate font-medium">
                      {user.name}
                      {self && (
                        <span className="text-muted-foreground font-normal"> · {t('you')}</span>
                      )}
                    </span>
                    <span className="text-muted-foreground truncate text-xs">@{user.username}</span>
                  </div>
                </div>
              </TableCell>
              <TableCell className="hidden md:table-cell">
                <div className="flex flex-wrap gap-1">
                  {user.roles.length === 0 ? (
                    <span className="text-muted-foreground text-xs">{t('noRoles')}</span>
                  ) : (
                    user.roles.map((role) => (
                      <Badge key={role.id} variant="secondary">
                        {role.label}
                      </Badge>
                    ))
                  )}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex items-center gap-1.5">
                  <Badge variant={user.disabled ? 'outline' : 'default'}>
                    {user.disabled ? t('status.disabled') : t('status.active')}
                  </Badge>
                  {user.twoFactor && (
                    <Badge variant="outline" className="gap-1">
                      <ShieldCheck aria-hidden />
                      {t('twoFactor')}
                    </Badge>
                  )}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground hidden text-sm lg:table-cell">
                {user.lastActiveAt
                  ? format.relativeTime(new Date(user.lastActiveAt), now)
                  : t('never')}
              </TableCell>
              <TableCell>
                {canUpdate && !self && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t('actions.menu', { name: user.name })}
                      >
                        <MoreHorizontal aria-hidden />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-64">
                      <DropdownMenuItem
                        onSelect={() => {
                          onAction('edit', user);
                        }}
                      >
                        {t('actions.edit')}
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/admin/users/${user.id}`}>{t('actions.folderAccess')}</Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          onAction('resetPassword', user);
                        }}
                      >
                        {t('actions.resetPassword')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          onAction('resetLink', user);
                        }}
                      >
                        {t('invitation.resetLink')}
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onSelect={() => {
                          onAction('exportData', user);
                        }}
                      >
                        {t('privacy.export')}
                      </DropdownMenuItem>
                      {user.twoFactor && (
                        <DropdownMenuItem
                          onSelect={() => {
                            onAction('resetTwoFactor', user);
                          }}
                        >
                          {t('actions.resetTwoFactor')}
                        </DropdownMenuItem>
                      )}
                      <DropdownMenuItem
                        onSelect={() => {
                          onAction('revokeSessions', user);
                        }}
                      >
                        {t('actions.revokeSessions')}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onSelect={() => {
                          onAction(user.disabled ? 'enable' : 'disable', user);
                        }}
                      >
                        {user.disabled ? t('actions.enable') : t('actions.disable')}
                      </DropdownMenuItem>
                      {canDelete && (
                        <DropdownMenuItem
                          variant="destructive"
                          onSelect={() => {
                            onAction('delete', user);
                          }}
                        >
                          {t('actions.delete')}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}
