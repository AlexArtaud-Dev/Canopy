'use client';

import { useQuery } from '@tanstack/react-query';
import { RotateCw } from 'lucide-react';
import { useFormatter, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { useErrorMessage } from '@/shared/errors/use-error-message';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Skeleton } from '@/shared/ui/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/shared/ui/tabs';

import { outboxKind } from '../mail.utils';
import { readOutboxMessage, resendOutboxMessage } from '../server/mail-actions';

interface MessageDialogProps {
  id: string | null;
  onClose: () => void;
  /** After a resend: the list shows the new message. */
  onResent: () => void;
}

/**
 * One stored e-mail as its recipient saw it. The HTML is shown in a sandboxed frame (no scripts,
 * no access to this page); the plain text alongside.
 */
export function MessageDialog({ id, onClose, onResent }: MessageDialogProps) {
  const t = useTranslations('mail.outbox');
  const format = useFormatter();
  const errorMessage = useErrorMessage();
  const [confirming, setConfirming] = useState(false);
  const [sending, startSending] = useTransition();
  const message = useQuery({
    queryKey: ['mail', 'message', id],
    enabled: id !== null,
    queryFn: async () => {
      const result = await readOutboxMessage({ id });
      if (!result.ok) throw new Error(errorMessage(result.error.code, result.error.params));
      return result.data;
    },
  });

  const resend = () => {
    if (!id) return;
    startSending(async () => {
      const result = await resendOutboxMessage({ id });
      setConfirming(false);
      if (!result.ok) {
        toast.error(errorMessage(result.error.code, result.error.params));
        return;
      }
      toast.success(t('viewer.resent'));
      onResent();
    });
  };

  const data = message.data;
  return (
    <Dialog
      open={id !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="grid max-h-[90dvh] grid-rows-[auto_1fr_auto] sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="pr-6">{data?.subject ?? t('viewer.title')}</DialogTitle>
          <DialogDescription>
            {data
              ? t('viewer.meta', {
                  recipient: data.recipient,
                  date: format.dateTime(new Date(data.createdAt), {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  }),
                })
              : t('viewer.loading')}
          </DialogDescription>
          {data && (
            <div className="flex flex-wrap gap-1.5">
              {/* i18n-dynamic: mail.outbox.kinds */}
              <Badge variant="outline">{t(`kinds.${outboxKind(data.kind)}`)}</Badge>
              <Badge variant={data.status === 'failed' ? 'destructive' : 'secondary'}>
                {t(`statuses.${data.status}`)}
              </Badge>
              {data.attempts > 1 && (
                <Badge variant="outline">{t('attempts', { count: data.attempts })}</Badge>
              )}
            </div>
          )}
        </DialogHeader>

        {message.isError ? (
          <p className="text-destructive text-sm">{message.error.message}</p>
        ) : !data ? (
          <Skeleton className="h-80 w-full" />
        ) : (
          <Tabs defaultValue="html" className="min-h-0">
            <TabsList>
              <TabsTrigger value="html">{t('viewer.html')}</TabsTrigger>
              <TabsTrigger value="text">{t('viewer.text')}</TabsTrigger>
            </TabsList>
            <TabsContent value="html" className="min-h-0">
              <iframe
                title={t('viewer.html')}
                // No scripts, no same-origin: the mail cannot reach this page or its session.
                sandbox=""
                srcDoc={data.html}
                className="h-[55dvh] w-full rounded-lg border bg-white"
              />
            </TabsContent>
            <TabsContent value="text" className="min-h-0">
              <pre className="bg-muted/40 h-[55dvh] overflow-auto rounded-lg border p-4 text-xs whitespace-pre-wrap">
                {data.text}
              </pre>
            </TabsContent>
          </Tabs>
        )}

        <DialogFooter>
          <Button
            disabled={!data || sending}
            onClick={() => {
              setConfirming(true);
            }}
          >
            <RotateCw aria-hidden data-icon="inline-start" />
            {t('viewer.resend')}
          </Button>
        </DialogFooter>
      </DialogContent>
      <ConfirmDialog
        open={confirming}
        title={t('viewer.resendTitle')}
        description={t('viewer.resendDescription', { recipient: data?.recipient ?? '' })}
        confirmLabel={t('viewer.resend')}
        pending={sending}
        onConfirm={resend}
        onOpenChange={setConfirming}
      />
    </Dialog>
  );
}
