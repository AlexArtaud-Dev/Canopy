import type { Disk } from '@canopy/contracts';
import { HardDrive, MemoryStick, Moon, Thermometer } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { cn } from '@/shared/lib/utils';
import { Badge } from '@/shared/ui/badge';

const healthStyles: Record<
  Disk['health'],
  { dot: string; variant: 'secondary' | 'destructive' | 'outline'; className?: string }
> = {
  passed: { dot: 'bg-primary', variant: 'secondary' },
  warning: { dot: 'bg-chart-3', variant: 'outline', className: 'bg-chart-3/15 border-chart-3/40' },
  failing: { dot: 'bg-current', variant: 'destructive' },
  unknown: { dot: 'bg-muted-foreground', variant: 'outline' },
};

/** The disk's verdict, with a coloured dot so it reads at a glance. */
export function HealthBadge({ health }: { health: Disk['health'] }) {
  // i18n-dynamic: disks.health
  const t = useTranslations('disks.health');
  const style = healthStyles[health];
  return (
    <Badge variant={style.variant} className={cn('gap-1.5', style.className)}>
      <span className={cn('size-1.5 rounded-full', style.dot)} aria-hidden />
      {t(health)}
    </Badge>
  );
}

/** Flags beside the verdict: too hot, asleep (values from before it spun down). */
export function DiskFlags({ disk }: { disk: Pick<Disk, 'hot' | 'asleep'> }) {
  const t = useTranslations('disks');
  return (
    <>
      {disk.hot && (
        <Badge variant="destructive" className="gap-1">
          <Thermometer aria-hidden className="size-3" />
          {t('hot')}
        </Badge>
      )}
      {disk.asleep && (
        <Badge variant="outline" className="text-muted-foreground gap-1" title={t('asleepHint')}>
          <Moon aria-hidden className="size-3" />
          {t('asleep')}
        </Badge>
      )}
    </>
  );
}

/** A drive icon: NVMe drives look like memory modules, everything else like a drive. */
export function KindIcon({ kind, className }: { kind: Disk['kind']; className?: string }) {
  const Icon = kind === 'nvme' ? MemoryStick : HardDrive;
  return <Icon aria-hidden className={className} />;
}
