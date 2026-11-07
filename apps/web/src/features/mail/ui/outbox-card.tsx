'use client';

import { useFormatter, useTranslations } from 'next-intl';

import { Badge } from '@/shared/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

export interface OutboxRow {
  id: string;
  recipient: string;
  subject: string;
  status: 'queued' | 'sent' | 'failed';
  attempts: number;
  /** Already translated. */
  error: string | null;
  createdAt: string;
}

const statusVariant = { sent: 'default', queued: 'secondary', failed: 'destructive' } as const;

export function OutboxCard({ rows }: { rows: readonly OutboxRow[] }) {
  const t = useTranslations('mail.outbox');
  const format = useFormatter();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('empty')}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('columns.recipient')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('columns.subject')}</TableHead>
                <TableHead>{t('columns.status')}</TableHead>
                <TableHead className="hidden sm:table-cell">{t('columns.when')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="max-w-48 truncate">{row.recipient}</TableCell>
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
                    {format.relativeTime(new Date(row.createdAt))}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
