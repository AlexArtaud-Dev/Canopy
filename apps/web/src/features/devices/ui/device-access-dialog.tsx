'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useId, useState } from 'react';

import { Button } from '@/shared/ui/button';
import { Checkbox } from '@/shared/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Label } from '@/shared/ui/label';
import { Spinner } from '@/shared/ui/spinner';

import { deviceName, type Device } from '../devices.utils';

/** A group an administrator may allow on a device. */
export interface GroupOption {
  id: string;
  name: string;
}

interface DeviceAccessDialogProps {
  device: Device;
  groups: readonly GroupOption[];
  pending: boolean;
  onClose: () => void;
  onSubmit: (groupIds: string[]) => void;
}

/**
 * Chooses the groups allowed to use a device. None checked keeps it open to everyone who may
 * run the plugin's commands; administrators use every device.
 */
export function DeviceAccessDialog({
  device,
  groups,
  pending,
  onClose,
  onSubmit,
}: DeviceAccessDialogProps) {
  const t = useTranslations('devices.access');
  const formId = useId();
  // The parent mounts a fresh dialog for each device, so this starts from it.
  const [chosen, setChosen] = useState<ReadonlySet<string>>(new Set(device.groupIds));
  const toggle = (id: string, checked: boolean) => {
    setChosen((current) => {
      const next = new Set(current);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title', { name: deviceName(device) })}</DialogTitle>
          <DialogDescription>{t('description')}</DialogDescription>
        </DialogHeader>
        {groups.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t('noGroups')}{' '}
            <Link href="/admin/groups" className="text-primary underline-offset-4 hover:underline">
              {t('createGroups')}
            </Link>
          </p>
        ) : (
          <form
            id={formId}
            className="grid gap-1"
            onSubmit={(event) => {
              event.preventDefault();
              onSubmit([...chosen]);
            }}
          >
            <fieldset className="grid max-h-72 gap-1 overflow-y-auto">
              <legend className="sr-only">{t('groups')}</legend>
              {groups.map((group) => {
                const id = `${formId}-${group.id}`;
                return (
                  <div
                    key={group.id}
                    className="hover:bg-muted flex min-h-10 items-center gap-3 rounded-md px-2"
                  >
                    <Checkbox
                      id={id}
                      checked={chosen.has(group.id)}
                      onCheckedChange={(checked) => {
                        toggle(group.id, checked === true);
                      }}
                    />
                    <Label htmlFor={id} className="flex-1 cursor-pointer py-2 font-normal">
                      {group.name}
                    </Label>
                  </div>
                );
              })}
            </fieldset>
            <p className="text-muted-foreground pt-2 text-xs" aria-live="polite">
              {chosen.size === 0 ? t('open') : t('restricted', { count: chosen.size })}
            </p>
          </form>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('cancel')}
          </Button>
          {groups.length > 0 && (
            <Button type="submit" form={formId} disabled={pending} aria-busy={pending}>
              {pending && <Spinner data-icon="inline-start" />}
              {t('save')}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
