'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Bell, BellOff, CheckCheck, Inbox } from 'lucide-react';
import Link from 'next/link';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { useState } from 'react';

import { cn } from 'cn';
import { useIsMobile } from '@/shared/ui/use-mobile';
import { Button } from '@/shared/ui/button';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from '@/shared/ui/empty';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/shared/ui/sheet';

import { linkTarget, unreadCount, type NotificationView } from './notifications.utils';
import { loadNotifications, markNotificationsRead } from './server/notifications-actions';

export const notificationsQueryKey = ['notifications'] as const;

/** New events show within a minute, and at once when the person comes back to the tab. */
const refreshMs = 60_000;

/**
 * The bell in the header: the person's notifications (drop-offs received…), unread first in
 * weight, each leading to what it is about. A sheet from the side, from the bottom on a phone.
 */
export function NotificationsContainer() {
  const t = useTranslations('notifications');
  const isMobile = useIsMobile();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const { data: items = [] } = useQuery({
    queryKey: notificationsQueryKey,
    queryFn: async () => {
      const result = await loadNotifications();
      return result.ok ? result.data : [];
    },
    refetchInterval: refreshMs,
    refetchOnWindowFocus: true,
  });
  const markRead = useMutation({
    mutationFn: (ids?: string[]) => markNotificationsRead(ids ? { ids } : {}),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: notificationsQueryKey });
    },
  });
  const unread = unreadCount(items);

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative pointer-coarse:size-10"
          aria-label={unread > 0 ? t('openUnread', { count: unread }) : t('open')}
        >
          <Bell aria-hidden />
          {unread > 0 && (
            <span
              aria-hidden
              className="bg-primary text-primary-foreground absolute -top-0.5 -right-0.5 min-w-4 rounded-full px-1 text-center text-[10px] leading-4 font-medium tabular-nums"
            >
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent
        side={isMobile ? 'bottom' : 'right'}
        className="max-h-[90dvh] gap-0 overflow-y-auto sm:max-w-md"
      >
        <SheetHeader className="border-b">
          <SheetTitle>{t('title')}</SheetTitle>
          <SheetDescription>{t('description')}</SheetDescription>
          {unread > 0 && (
            <Button
              variant="outline"
              size="sm"
              className="justify-self-start"
              disabled={markRead.isPending}
              onClick={() => {
                markRead.mutate(undefined);
              }}
            >
              <CheckCheck aria-hidden />
              {t('markAllRead')}
            </Button>
          )}
        </SheetHeader>
        {items.length === 0 ? (
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <BellOff aria-hidden />
              </EmptyMedia>
              <EmptyTitle>{t('emptyTitle')}</EmptyTitle>
              <EmptyDescription>{t('empty')}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : (
          <ul className="divide-y">
            {items.map((item) => (
              <NotificationRow
                key={item.id}
                item={item}
                onOpen={() => {
                  if (!item.read) markRead.mutate([item.id]);
                  setOpen(false);
                }}
              />
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}

function NotificationRow({ item, onOpen }: { item: NotificationView; onOpen: () => void }) {
  const t = useTranslations('notifications');
  const format = useFormatter();
  const now = useNow({ updateInterval: refreshMs });
  const who =
    typeof item.params.name === 'string' && item.params.name !== ''
      ? item.params.name
      : t('someone');
  // i18n-dynamic: notifications.kinds
  const text = t(`kinds.${item.kind}`, { ...item.params, who });
  const body = (
    <>
      <Inbox
        aria-hidden
        className={cn(
          'mt-0.5 size-4 shrink-0',
          item.read ? 'text-muted-foreground' : 'text-primary',
        )}
      />
      <span className="grid min-w-0 flex-1 gap-0.5">
        <span className={cn('text-sm', !item.read && 'font-medium')}>{text}</span>
        <span className="text-muted-foreground text-xs">
          {format.relativeTime(new Date(item.updatedAt), now)}
        </span>
      </span>
      {!item.read && (
        <span className="bg-primary mt-1.5 size-2 shrink-0 rounded-full">
          <span className="sr-only">{t('unread')}</span>
        </span>
      )}
    </>
  );
  const row = 'hover:bg-muted flex w-full items-start gap-3 px-4 py-3 text-left';
  return (
    <li>
      {item.href ? (
        // Typed routes cannot know a path stored with the notification; it is checked in-app.
        <Link href={linkTarget(item.href)} className={row} onClick={onOpen}>
          {body}
        </Link>
      ) : (
        <button type="button" className={row} onClick={onOpen}>
          {body}
        </button>
      )}
    </li>
  );
}
