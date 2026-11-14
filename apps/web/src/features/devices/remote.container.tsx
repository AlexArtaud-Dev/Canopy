'use client';

import { Cast } from 'lucide-react';
import { useTranslations } from 'next-intl';

import { useIsMobile } from '@/shared/ui/use-mobile';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/shared/ui/sheet';

import { useCasts } from './model/use-casts';
import { CastCard } from './ui/cast-card';

/**
 * The remote: a button in the header, there only while something plays on a screen, opening the
 * casts with their controls (a sheet from the side, from the bottom on a phone).
 */
export function RemoteContainer() {
  const t = useTranslations('devices.remote');
  const isMobile = useIsMobile();
  const casts = useCasts();
  if (casts.length === 0) return null;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button variant="outline" size="sm" aria-label={t('open', { count: casts.length })}>
          <Cast aria-hidden className="text-primary" />
          <span className="max-sm:sr-only">{t('title')}</span>
          {casts.length > 1 && <Badge variant="secondary">{casts.length}</Badge>}
        </Button>
      </SheetTrigger>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className="max-h-[90dvh] gap-0 overflow-y-auto sm:max-w-md"
      >
        <SheetHeader>
          <SheetTitle>{t('title')}</SheetTitle>
          <SheetDescription>{t('description')}</SheetDescription>
        </SheetHeader>
        <div className="grid gap-3 p-4 pt-0">
          {casts.map((cast) => (
            <CastCard key={cast.job.id} cast={cast} />
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
