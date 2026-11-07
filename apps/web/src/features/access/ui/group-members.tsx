'use client';

import { Search, UserMinus, UserPlus } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { Avatar, AvatarFallback } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/ui/empty';
import { Input } from '@/shared/ui/input';

export interface Person {
  id: string;
  username: string;
  name: string;
  initials: string;
}

interface GroupMembersProps {
  members: readonly Person[];
  candidates: readonly Person[];
  canEdit: boolean;
  pending: boolean;
  onAdd: (userId: string) => void;
  onRemove: (userId: string) => void;
}

const suggestionLimit = 8;

function PersonLine({ person }: { person: Person }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <Avatar className="size-8 rounded-lg">
        <AvatarFallback className="rounded-lg text-xs">{person.initials}</AvatarFallback>
      </Avatar>
      <div className="grid min-w-0 leading-tight">
        <span className="truncate text-sm font-medium">{person.name}</span>
        <span className="text-muted-foreground truncate text-xs">@{person.username}</span>
      </div>
    </div>
  );
}

export function GroupMembers({
  members,
  candidates,
  canEdit,
  pending,
  onAdd,
  onRemove,
}: GroupMembersProps) {
  const t = useTranslations('access.groups.membersPage');
  const [search, setSearch] = useState('');
  const needle = search.trim().toLowerCase();
  const suggestions = needle
    ? candidates
        .filter((person) => `${person.name} ${person.username}`.toLowerCase().includes(needle))
        .slice(0, suggestionLimit)
    : [];

  return (
    <div className="grid gap-6">
      {canEdit && (
        <Card>
          <CardHeader>
            <CardTitle>{t('addTitle')}</CardTitle>
            <CardDescription>{t('addDescription')}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <div className="relative">
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
            {needle && suggestions.length === 0 && (
              <p className="text-muted-foreground text-sm">{t('noMatch')}</p>
            )}
            {suggestions.length > 0 && (
              <ul className="divide-y rounded-lg border">
                {suggestions.map((person) => (
                  <li key={person.id} className="flex items-center justify-between gap-3 p-2">
                    <PersonLine person={person} />
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={pending}
                      onClick={() => {
                        onAdd(person.id);
                      }}
                    >
                      <UserPlus aria-hidden data-icon="inline-start" />
                      {t('add')}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>{t('membersTitle', { count: members.length })}</CardTitle>
        </CardHeader>
        <CardContent>
          {members.length === 0 ? (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>{t('empty.title')}</EmptyTitle>
                <EmptyDescription>{t('empty.description')}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            <ul className="divide-y">
              {members.map((person) => (
                <li
                  key={person.id}
                  className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
                >
                  <PersonLine person={person} />
                  {canEdit && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={pending}
                      aria-label={t('removeLabel', { name: person.name })}
                      onClick={() => {
                        onRemove(person.id);
                      }}
                    >
                      <UserMinus aria-hidden data-icon="inline-start" />
                      {t('remove')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
