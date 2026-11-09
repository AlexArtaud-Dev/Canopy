'use client';

import { Laptop } from 'lucide-react';
import { useFormatter, useNow, useTranslations } from 'next-intl';

import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card';

export interface SessionItem {
  id: string;
  browser: string | null;
  os: string | null;
  ipAddress: string | null;
  lastActiveAt: string;
  current: boolean;
}

interface SessionsCardProps {
  sessions: readonly SessionItem[];
  pending: boolean;
  onRevoke: (sessionId: string) => void;
  onRevokeOthers: () => void;
}

export function SessionsCard({ sessions, pending, onRevoke, onRevokeOthers }: SessionsCardProps) {
  const t = useTranslations('auth.sessions');
  const format = useFormatter();
  // Relative times need a reference; it moves on every minute.
  const now = useNow({ updateInterval: 60_000 });
  const hasOthers = sessions.some((session) => !session.current);

  const deviceLabel = (session: SessionItem) => {
    if (session.browser && session.os) {
      return t('device', { browser: session.browser, os: session.os });
    }
    return session.browser ?? session.os ?? t('unknownDevice');
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
        {hasOthers && (
          <CardAction>
            <Button variant="outline" size="sm" onClick={onRevokeOthers} disabled={pending}>
              {t('revokeOthers')}
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        <ul className="divide-y" aria-label={t('title')}>
          {sessions.map((session) => (
            <li key={session.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
              <span className="bg-muted flex size-9 shrink-0 items-center justify-center rounded-lg">
                <Laptop className="text-muted-foreground size-4" aria-hidden />
              </span>
              <div className="grid min-w-0 flex-1 gap-0.5">
                <p className="flex items-center gap-2 truncate text-sm font-medium">
                  {deviceLabel(session)}
                  {session.current && <Badge variant="secondary">{t('current')}</Badge>}
                </p>
                <p className="text-muted-foreground truncate text-xs">
                  {session.ipAddress ?? t('unknownAddress')} ·{' '}
                  {t('lastActive', {
                    when: format.relativeTime(new Date(session.lastActiveAt), now),
                  })}
                </p>
              </div>
              {!session.current && (
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={pending}
                  onClick={() => {
                    onRevoke(session.id);
                  }}
                >
                  {t('revoke')}
                </Button>
              )}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
