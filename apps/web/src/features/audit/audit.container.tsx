'use client';

import { Download, Filter, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { useFormatter, useTranslations } from 'next-intl';
import { Fragment, useState, useTransition, type SubmitEvent } from 'react';
import { toast } from 'sonner';

import { useFormError } from '@/shared/errors/use-error-message';
import { formText } from '@/shared/lib/form';
import { useCan } from '@/shared/permissions/can';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@/shared/ui/empty';
import { Field, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Spinner } from '@/shared/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';

import { filtersQuery, type AuditFilters } from './audit-view.utils';
import { exportAuditCsv } from './server/audit-actions';
import type { AuditRow } from './server/audit-store';

const any = '__any';
const resultVariant = { success: 'default', denied: 'outline', error: 'destructive' } as const;

interface AuditContainerProps {
  rows: readonly AuditRow[];
  total: number;
  pages: number;
  filters: AuditFilters;
  actions: readonly string[];
}

export function AuditContainer({ rows, total, pages, filters, actions }: AuditContainerProps) {
  const t = useTranslations('audit');
  const format = useFormatter();
  const router = useRouter();
  const pathname = usePathname();
  const toFormError = useFormError();
  const canExport = useCan('audit:export');
  const [action, setAction] = useState(filters.action ?? any);
  const [result, setResult] = useState<string>(filters.result ?? any);
  const [open, setOpen] = useState<string | null>(null);
  const [exporting, startExport] = useTransition();

  const go = (next: AuditFilters, page: number) => {
    router.push(`${pathname}${filtersQuery(next, page)}` as Parameters<typeof router.push>[0]);
  };

  const apply = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (name: string) => formText(form, name).trim() || undefined;
    go(
      {
        actor: text('actor'),
        target: text('target'),
        from: text('from'),
        to: text('to'),
        action: action === any ? undefined : action,
        result:
          result === 'success' || result === 'denied' || result === 'error' ? result : undefined,
        page: 1,
      },
      1,
    );
  };

  const download = () => {
    startExport(async () => {
      const response = await exportAuditCsv(filters);
      if (!response.ok) {
        toast.error(toFormError(response.error).message);
        return;
      }
      const url = URL.createObjectURL(new Blob([response.data.csv], { type: 'text/csv' }));
      const link = document.createElement('a');
      link.href = url;
      link.download = `canopy-audit-${new Date().toISOString().slice(0, 10)}.csv`;
      link.click();
      URL.revokeObjectURL(url);
      toast.success(t('exported', { count: response.data.rows }));
    });
  };

  return (
    <div className="grid gap-4">
      <form
        key={filtersQuery(filters, 1)}
        onSubmit={apply}
        className="bg-card grid gap-3 rounded-xl border p-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        <Field>
          <FieldLabel htmlFor="audit-actor">{t('filters.actor')}</FieldLabel>
          <Input
            id="audit-actor"
            name="actor"
            defaultValue={filters.actor}
            placeholder={t('filters.actorPlaceholder')}
          />
        </Field>
        <Field>
          <FieldLabel htmlFor="audit-action">{t('filters.action')}</FieldLabel>
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger id="audit-action" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={any}>{t('filters.anyAction')}</SelectItem>
              {actions.map((name) => (
                <SelectItem key={name} value={name} className="font-mono text-xs">
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="audit-result">{t('filters.result')}</FieldLabel>
          <Select value={result} onValueChange={setResult}>
            <SelectTrigger id="audit-result" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={any}>{t('filters.anyResult')}</SelectItem>
              {(['success', 'denied', 'error'] as const).map((value) => (
                <SelectItem key={value} value={value}>
                  {t(`results.${value}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <Field>
          <FieldLabel htmlFor="audit-target">{t('filters.target')}</FieldLabel>
          <Input id="audit-target" name="target" defaultValue={filters.target} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="audit-from">{t('filters.from')}</FieldLabel>
            <Input id="audit-from" name="from" type="date" defaultValue={filters.from} />
          </Field>
          <Field>
            <FieldLabel htmlFor="audit-to">{t('filters.to')}</FieldLabel>
            <Input id="audit-to" name="to" type="date" defaultValue={filters.to} />
          </Field>
        </div>
        <div className="flex items-end gap-2">
          <Button type="submit">
            <Filter aria-hidden data-icon="inline-start" />
            {t('filters.apply')}
          </Button>
          <Button
            type="button"
            variant="ghost"
            onClick={() => {
              setAction(any);
              setResult(any);
              go({ page: 1 }, 1);
            }}
          >
            <X aria-hidden data-icon="inline-start" />
            {t('filters.clear')}
          </Button>
          {canExport && (
            <Button
              type="button"
              variant="outline"
              className="ml-auto"
              disabled={exporting}
              onClick={download}
            >
              {exporting ? <Spinner /> : <Download aria-hidden data-icon="inline-start" />}
              {t('export')}
            </Button>
          )}
        </div>
      </form>

      {rows.length === 0 ? (
        <Empty className="border border-dashed">
          <EmptyHeader>
            <EmptyTitle>{t('empty.title')}</EmptyTitle>
            <EmptyDescription>{t('empty.description')}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <div className="rounded-xl border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('columns.when')}</TableHead>
                <TableHead>{t('columns.actor')}</TableHead>
                <TableHead>{t('columns.action')}</TableHead>
                <TableHead>{t('columns.result')}</TableHead>
                <TableHead className="hidden lg:table-cell">{t('columns.target')}</TableHead>
                <TableHead className="hidden md:table-cell">{t('columns.address')}</TableHead>
                <TableHead className="w-20" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <Fragment key={row.id}>
                  <TableRow>
                    <TableCell className="text-sm whitespace-nowrap">
                      <time dateTime={row.occurredAt}>
                        {format.dateTime(new Date(row.occurredAt), {
                          dateStyle: 'short',
                          timeStyle: 'medium',
                        })}
                      </time>
                    </TableCell>
                    <TableCell className="max-w-36 truncate">
                      {row.actorName ?? (row.requestId === 'system' ? t('system') : t('anonymous'))}
                    </TableCell>
                    <TableCell className="font-mono text-xs">{row.action}</TableCell>
                    <TableCell>
                      <Badge variant={resultVariant[row.result]}>
                        {t(`results.${row.result}`)}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden max-w-48 truncate lg:table-cell">
                      {row.target}
                    </TableCell>
                    <TableCell className="text-muted-foreground hidden font-mono text-xs md:table-cell">
                      {row.actorIp}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="xs"
                        aria-expanded={open === row.id}
                        onClick={() => {
                          setOpen(open === row.id ? null : row.id);
                        }}
                      >
                        {t('details')}
                      </Button>
                    </TableCell>
                  </TableRow>
                  {open === row.id && (
                    <TableRow>
                      <TableCell colSpan={7} className="bg-muted/40">
                        <p className="text-muted-foreground mb-1 text-xs">
                          {t('request', { id: row.requestId })}
                          {row.target ? ` · ${row.target}` : ''}
                        </p>
                        <pre className="max-h-48 overflow-auto text-xs whitespace-pre-wrap">
                          {JSON.stringify(row.meta, null, 2)}
                        </pre>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <div className="flex items-center justify-between gap-2">
        <p className="text-muted-foreground text-sm">
          {t('pagination.summary', { page: filters.page, pages, total })}
        </p>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={filters.page <= 1}
            onClick={() => {
              go(filters, filters.page - 1);
            }}
          >
            {t('pagination.previous')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={filters.page >= pages}
            onClick={() => {
              go(filters, filters.page + 1);
            }}
          >
            {t('pagination.next')}
          </Button>
        </div>
      </div>
    </div>
  );
}
