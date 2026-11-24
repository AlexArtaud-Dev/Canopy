'use client';

import type { Disk } from '@canopy/contracts';
import { AlertTriangle, Gauge, Play } from 'lucide-react';
import { useFormatter, useLocale, useTranslations } from 'next-intl';
import type { ReactNode } from 'react';

import { cn } from '@/shared/lib/utils';
import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/shared/ui/card';
import { Progress } from '@/shared/ui/progress';

import { ageParts, diskName, formatCapacity } from '../disks.utils';
import { DiskFlags, HealthBadge, KindIcon } from './disk-look';

interface DiskCardProps {
  disk: Disk;
  /** Administrators may run self-tests. */
  canManage: boolean;
  /** Which test is being started for this disk, if any. */
  starting: 'short' | 'long' | null;
  onSelfTest: (test: 'short' | 'long') => void;
}

/** One figure of the disk: a label and its value, warning-coloured when it is bad news. */
function Stat({ label, children, bad }: { label: string; children: ReactNode; bad?: boolean }) {
  return (
    <div className="min-w-0">
      <dt className="text-muted-foreground truncate text-xs">{label}</dt>
      <dd className={cn('truncate text-sm font-medium tabular-nums', bad && 'text-destructive')}>
        {children}
      </dd>
    </div>
  );
}

/** Everything a disk tells about its health, and its self-test. */
export function DiskCard({ disk, canManage, starting, onSelfTest }: DiskCardProps) {
  const t = useTranslations('disks');
  const locale = useLocale();
  const format = useFormatter();
  const count = (value: number) => format.number(value);
  const counters: {
    key: 'reallocated' | 'pending' | 'uncorrectable' | 'mediaErrors' | 'crcErrors';
    value: number | undefined;
  }[] = [
    { key: 'reallocated', value: disk.reallocated },
    { key: 'pending', value: disk.pending },
    { key: 'uncorrectable', value: disk.uncorrectable },
    { key: 'mediaErrors', value: disk.mediaErrors },
    { key: 'crcErrors', value: disk.crcErrors },
  ];
  const test = disk.selfTest;
  const details = [disk.device, formatCapacity(disk.capacity, locale), t(`kinds.${disk.kind}`)];

  return (
    <Card>
      {/* Badges sit beside the name on wide cards, under it on a phone. */}
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="bg-muted text-muted-foreground flex size-10 shrink-0 items-center justify-center rounded-md">
            <KindIcon kind={disk.kind} className="size-5" />
          </span>
          <div className="min-w-0">
            <CardTitle className="truncate" title={diskName(disk)}>
              {diskName(disk)}
            </CardTitle>
            <CardDescription className="truncate">{details.join(' · ')}</CardDescription>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5 sm:justify-end">
          <HealthBadge health={disk.health} />
          <DiskFlags disk={disk} />
        </div>
      </CardHeader>
      <CardContent className="grid gap-4">
        {disk.reasons.length > 0 && (
          <Alert variant={disk.health === 'failing' ? 'destructive' : 'default'}>
            <AlertTriangle aria-hidden />
            <AlertDescription>
              <ul className="grid gap-1">
                {disk.reasons.map((reason) => (
                  <li key={reason}>{t(`reasons.${reason}`)}</li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 empty:hidden sm:grid-cols-3">
          {disk.temperature !== undefined && (
            <Stat label={t('stats.temperature')} bad={disk.hot}>
              {format.number(disk.temperature, { style: 'unit', unit: 'celsius' })}
            </Stat>
          )}
          {disk.powerOnHours !== undefined && (
            <Stat label={t('stats.age')}>{t('stats.ageValue', ageParts(disk.powerOnHours))}</Stat>
          )}
          {disk.powerCycles !== undefined && (
            <Stat label={t('stats.powerCycles')}>{count(disk.powerCycles)}</Stat>
          )}
          {counters.map(({ key, value }) =>
            value === undefined ? null : (
              <Stat key={key} label={t(`stats.${key}`)} bad={value > 0 && key !== 'crcErrors'}>
                {count(value)}
              </Stat>
            ),
          )}
          {disk.spare !== undefined && (
            <Stat
              label={t('stats.spare')}
              bad={disk.spareLimit !== undefined && disk.spare < disk.spareLimit}
            >
              {format.number(disk.spare / 100, { style: 'percent' })}
            </Stat>
          )}
          {disk.bytesWritten !== undefined && (
            <Stat label={t('stats.written')}>{formatCapacity(disk.bytesWritten, locale)}</Stat>
          )}
          {disk.serial && <Stat label={t('stats.serial')}>{disk.serial}</Stat>}
          {disk.firmware && <Stat label={t('stats.firmware')}>{disk.firmware}</Stat>}
        </dl>

        {disk.wearPercent !== undefined && (
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground flex items-center gap-1.5">
                <Gauge aria-hidden className="size-3.5" />
                {t('stats.wear')}
              </span>
              <span className="tabular-nums">
                {t('stats.wearValue', { used: disk.wearPercent })}
              </span>
            </div>
            <Progress
              value={Math.min(disk.wearPercent, 100)}
              aria-label={t('stats.wear')}
              className={cn(disk.wearPercent >= 90 && '[&>*]:bg-destructive')}
            />
          </div>
        )}

        <section className="grid gap-2 border-t pt-4" aria-label={t('selfTest.title')}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-sm font-medium">{t('selfTest.title')}</h3>
            {canManage && !test.running && (
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={starting !== null || disk.health === 'unknown'}
                  title={t('selfTest.shortHint')}
                  onClick={() => {
                    onSelfTest('short');
                  }}
                >
                  <Play aria-hidden />
                  {t('selfTest.short')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={starting !== null || disk.health === 'unknown'}
                  title={t('selfTest.longHint')}
                  onClick={() => {
                    onSelfTest('long');
                  }}
                >
                  <Play aria-hidden />
                  {t('selfTest.long')}
                </Button>
              </div>
            )}
          </div>
          {test.running ? (
            <div className="grid gap-1.5">
              <p className="text-muted-foreground text-xs">
                {t('selfTest.running', { remaining: test.remainingPercent ?? 100 })}
              </p>
              <Progress
                value={100 - (test.remainingPercent ?? 100)}
                aria-label={t('selfTest.title')}
              />
            </div>
          ) : (
            <p
              className={cn(
                'text-muted-foreground text-xs',
                test.last && !test.last.passed && 'text-destructive',
              )}
            >
              {test.last
                ? t('selfTest.last', { kind: test.last.kind, result: test.last.result })
                : t('selfTest.none')}
            </p>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
