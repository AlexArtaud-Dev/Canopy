import { Database, Globe, Server, type LucideIcon } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { Badge } from '@/shared/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/shared/ui/card';
import { LocalTime } from '@/shared/i18n/local-time';
import { cn } from '@/shared/lib/utils';

import type { ServiceState, SystemStatus } from '../system.types';

const services: readonly { key: 'web' | 'engine' | 'database'; icon: LucideIcon }[] = [
  { key: 'web', icon: Globe },
  { key: 'engine', icon: Server },
  { key: 'database', icon: Database },
];

const stateStyles: Record<
  ServiceState,
  { dot: string; badge: 'secondary' | 'destructive' | 'outline' }
> = {
  up: { dot: 'bg-primary', badge: 'secondary' },
  down: { dot: 'bg-destructive', badge: 'destructive' },
  unknown: { dot: 'bg-muted-foreground', badge: 'outline' },
};

export function SystemStatusCard({ status }: { status: SystemStatus }) {
  const t = useTranslations('system');

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('status.title')}</CardTitle>
        <CardDescription>{t('status.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <ul className="divide-y" aria-label={t('status.title')}>
          {services.map(({ key, icon: Icon }) => {
            const state = status[key];
            const style = stateStyles[state];
            return (
              <li key={key} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                <span className="bg-muted text-muted-foreground flex size-9 shrink-0 items-center justify-center rounded-md">
                  <Icon className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{t(`services.${key}.name`)}</p>
                  <p className="text-muted-foreground text-xs text-pretty">
                    {t(`services.${key}.description`)}
                  </p>
                </div>
                <Badge variant={style.badge} className="gap-1.5">
                  <span className={cn('size-1.5 rounded-full', style.dot)} aria-hidden />
                  {t(`states.${state}`)}
                </Badge>
              </li>
            );
          })}
        </ul>
      </CardContent>
      <CardFooter className="text-muted-foreground text-xs">
        {t.rich('status.checkedAt', { time: () => <LocalTime iso={status.checkedAt} /> })}
      </CardFooter>
    </Card>
  );
}
