'use client';

import { Check, ChevronRight, Folder, SearchCheck, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState, useTransition } from 'react';

import type { FormErrorContent } from '@/shared/errors/form-error';
import { FormError } from '@/shared/errors/form-error';
import { useFormError } from '@/shared/errors/use-error-message';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Spinner } from '@/shared/ui/spinner';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/shared/ui/table';
import { breadcrumbs } from '@/features/files/files.utils';
import { browseFolders, type FolderEntry } from '@/features/files/server/grants';

import { explainUserAccess, type ExplainedAction } from './server/explain-access';

interface AccessCheckProps {
  userId: string;
  /** Group names by id, to name the group a deciding rule belongs to. */
  groupNames: Readonly<Record<string, string>>;
}

/** Pick a folder and see, per action, whether the user may act there and which rule decided. */
export function AccessCheckContainer({ userId, groupNames }: AccessCheckProps) {
  const t = useTranslations('access.userAccess');
  const grantsT = useTranslations('files.grants');
  const toFormError = useFormError();
  const [path, setPath] = useState('/');
  const [folders, setFolders] = useState<FolderEntry[]>([]);
  const [result, setResult] = useState<{ path: string; decisions: ExplainedAction[] } | null>(null);
  const [error, setError] = useState<FormErrorContent | null>(null);
  const [browsing, startBrowsing] = useTransition();
  const [checking, startChecking] = useTransition();

  const browse = (target: string) => {
    startBrowsing(async () => {
      const response = await browseFolders({ path: target });
      setError(response.ok ? null : toFormError(response.error));
      if (!response.ok) return;
      setPath(response.data.path);
      setFolders(response.data.folders);
    });
  };

  useEffect(() => {
    browse('/');
    // Initial listing only; later navigation is user-driven.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const check = () => {
    startChecking(async () => {
      const response = await explainUserAccess({ userId, path });
      setError(response.ok ? null : toFormError(response.error));
      setResult(response.ok ? response.data : null);
    });
  };

  const decidedBy = (decision: ExplainedAction) => {
    if (decision.byAdmin) return t('byAdmin');
    if (!decision.grant) return t('noRule');
    const owner =
      decision.grant.subjectType === 'group'
        ? t('groupRule', {
            group: groupNames[decision.grant.subjectId] ?? decision.grant.subjectId,
          })
        : t('ownRule');
    return `${owner} · ${decision.grant.path} · ${grantsT(`effects.${decision.grant.effect}`)}`;
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <SearchCheck className="text-muted-foreground size-4" aria-hidden />
          {t('checkTitle')}
        </CardTitle>
        <CardDescription>{t('checkDescription')}</CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        {error && <FormError error={error} />}
        <nav aria-label={grantsT('folder')} className="flex flex-wrap items-center gap-0.5 text-sm">
          {breadcrumbs(path).map((crumb, index, all) => (
            <span key={crumb.path} className="flex items-center gap-0.5">
              <Button
                variant="ghost"
                size="xs"
                disabled={browsing || index === all.length - 1}
                onClick={() => {
                  browse(crumb.path);
                }}
              >
                {crumb.path === '/' ? grantsT('root') : crumb.name}
              </Button>
              {index < all.length - 1 && (
                <ChevronRight className="text-muted-foreground size-3" aria-hidden />
              )}
            </span>
          ))}
        </nav>
        <div className="max-h-48 overflow-y-auto rounded-lg border" aria-busy={browsing}>
          {browsing ? (
            <p className="text-muted-foreground flex items-center gap-2 p-3 text-sm">
              <Spinner />
              {grantsT('loading')}
            </p>
          ) : folders.length === 0 ? (
            <p className="text-muted-foreground p-3 text-sm">{grantsT('noSubfolders')}</p>
          ) : (
            <ul className="divide-y">
              {folders.map((folder) => (
                <li key={folder.path}>
                  <button
                    type="button"
                    className="hover:bg-muted flex w-full items-center gap-2 px-3 py-2 text-left text-sm"
                    onClick={() => {
                      browse(folder.path);
                    }}
                  >
                    <Folder className="text-muted-foreground size-4" aria-hidden />
                    <span className="truncate">{folder.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <Button className="w-fit" onClick={check} disabled={checking}>
          {checking ? <Spinner /> : <SearchCheck aria-hidden data-icon="inline-start" />}
          {t('checkButton', { path })}
        </Button>
        {result && (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('columns.action')}</TableHead>
                <TableHead>{t('columns.result')}</TableHead>
                <TableHead>{t('columns.decidedBy')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.decisions.map((decision) => (
                <TableRow key={decision.action}>
                  <TableCell>
                    {/* i18n-dynamic: files.grants.actionNames */}
                    {grantsT(`actionNames.${decision.action}` as Parameters<typeof grantsT>[0])}
                  </TableCell>
                  <TableCell>
                    <Badge variant={decision.allowed ? 'default' : 'outline'} className="gap-1">
                      {decision.allowed ? <Check aria-hidden /> : <X aria-hidden />}
                      {decision.allowed ? t('allowed') : t('denied')}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground text-sm whitespace-normal">
                    {decidedBy(decision)}
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
