'use client';

import { Eye, Search } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

type Route = Parameters<ReturnType<typeof useRouter>['replace']>[0];

import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

import {
  outboxHref,
  outboxKind,
  outboxPageSize,
  outboxStatuses,
  type OutboxQuery,
  type OutboxStatus,
} from '../mail.utils';
import { MessageDialog } from './message-dialog';

export interface OutboxRow {
  id: string;
  kind: string;
  recipient: string;
  subject: string;
  status: OutboxStatus;
  attempts: number;
  /** Already translated. */
  error: string | null;
  createdAt: string;
}

interface OutboxCardProps {
  rows: readonly OutboxRow[];
  total: number;
  query: OutboxQuery;
  /** How long e-mails are kept (Settings › System). */
  retentionDays: number;
  /** Administrators read e-mails and send them again; others see the list only. */
  canOpen: boolean;
}

const statusVariant = { sent: 'default', queued: 'secondary', failed: 'destructive' } as const;
const searchDelayMs = 300;
const allStatuses = 'all';

/** Every e-mail kept, newest first, searchable; administrators open one to read or resend it. */
export function OutboxCard({ rows, total, query, retentionDays, canOpen }: OutboxCardProps) {
  const t = useTranslations('mail.outbox');
  const format = useFormatter();
  const now = useNow({ updateInterval: 60_000 });
  const router = useRouter();
  const pathname = usePathname();
  const [search, setSearch] = useState(query.q);
  const [opened, setOpened] = useState<string | null>(null);
  const pages = Math.max(1, Math.ceil(total / outboxPageSize));
  const go = (next: Partial<OutboxQuery>) => {
    router.replace(outboxHref(pathname, { ...query, page: 1, ...next }) as Route, {
      scroll: false,
    });
  };

  // Debounced search kept in the URL, so it survives reloads and can be shared.
  useEffect(() => {
    if (search.trim() === query.q) return;
    const timer = setTimeout(() => {
      router.replace(outboxHref(pathname, { ...query, q: search.trim(), page: 1 }) as Route, {
        scroll: false,
      });
    }, searchDelayMs);
    return () => {
      clearTimeout(timer);
    };
  }, [search, query, pathname, router]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description', { days: retentionDays })}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          <div className="relative min-w-48 flex-1">
            <Search
              aria-hidden
              className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
            />
            <Input
              type="search"
              value={search}
              placeholder={t('search')}
              aria-label={t('search')}
              className="pl-8"
              onChange={(event) => {
                setSearch(event.target.value);
              }}
            />
          </div>
          <Select
            value={query.status ?? allStatuses}
            onValueChange={(value) => {
              go({ status: value === allStatuses ? null : (value as OutboxStatus) });
            }}
          >
            <SelectTrigger className="w-40" aria-label={t('columns.status')}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={allStatuses}>{t('allStatuses')}</SelectItem>
              {outboxStatuses.map((status) => (
                <SelectItem key={status} value={status}>
                  {t(`statuses.${status}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {rows.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">
            {query.q || query.status ? t('noMatch') : t('empty')}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('columns.recipient')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('columns.subject')}</TableHead>
                <TableHead>{t('columns.status')}</TableHead>
                <TableHead className="hidden sm:table-cell">{t('columns.when')}</TableHead>
                {canOpen && <TableHead className="w-10" />}
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="max-w-48">
                    <span className="block truncate">{row.recipient}</span>
                    <span className="text-muted-foreground block text-xs">
                      {/* i18n-dynamic: mail.outbox.kinds */}
                      {t(`kinds.${outboxKind(row.kind)}`)}
                    </span>
                  </TableCell>
                  <TableCell className="hidden max-w-64 truncate md:table-cell">
                    {row.subject}
                  </TableCell>
                  <TableCell>
                    <div className="grid gap-0.5">
                      <Badge variant={statusVariant[row.status]} className="w-fit">
                        {t(`statuses.${row.status}`)}
                      </Badge>
                      {row.error && (
                        <span className="text-muted-foreground max-w-56 text-xs whitespace-normal">
                          {row.error} · {t('attempts', { count: row.attempts })}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground hidden text-sm sm:table-cell">
                    {format.relativeTime(new Date(row.createdAt), now)}
                  </TableCell>
                  {canOpen && (
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t('open', { subject: row.subject })}
                        onClick={() => {
                          setOpened(row.id);
                        }}
                      >
                        <Eye aria-hidden />
                      </Button>
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        <div className="flex items-center justify-between gap-2">
          <p className="text-muted-foreground text-sm">
            {t('pagination', { page: query.page, pages, total })}
          </p>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              disabled={query.page <= 1}
              onClick={() => {
                go({ page: query.page - 1 });
              }}
            >
              {t('previous')}
            </Button>
            <Button
              variant="outline"
              size="sm"
              disabled={query.page >= pages}
              onClick={() => {
                go({ page: query.page + 1 });
              }}
            >
              {t('next')}
            </Button>
          </div>
        </div>
      </CardContent>
      {canOpen && (
        <MessageDialog
          id={opened}
          onClose={() => {
            setOpened(null);
          }}
          onResent={() => {
            setOpened(null);
            router.refresh();
          }}
        />
      )}
    </Card>
  );
}
