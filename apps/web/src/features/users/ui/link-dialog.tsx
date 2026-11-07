'use client';

import { Copy } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { toast } from 'sonner';

import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Input } from '@/shared/ui/input';

/** Shows a one-time link the administrator relays when email is not configured. */
export function LinkDialog({ link, onClose }: { link: string | null; onClose: () => void }) {
  const t = useTranslations('users.invitation');

  return (
    <Dialog
      open={link !== null}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{t('linkTitle')}</DialogTitle>
          <DialogDescription>{t('linkDescription')}</DialogDescription>
        </DialogHeader>
        <Input
          readOnly
          value={link ?? ''}
          aria-label={t('linkTitle')}
          className="font-mono text-xs"
          onFocus={(event) => {
            event.currentTarget.select();
          }}
        />
        <DialogFooter>
          <Button
            onClick={() => {
              if (!link) return;
              void navigator.clipboard.writeText(link).then(() => {
                toast.success(t('copied'));
              });
            }}
          >
            <Copy aria-hidden data-icon="inline-start" />
            {t('copy')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
