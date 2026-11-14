'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Eye,
  EyeOff,
  KeyRound,
  Lock,
  MoreHorizontal,
  Pencil,
  Plus,
  Radar,
  Trash2,
  UsersRound,
} from 'lucide-react';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { cn } from 'cn';
import { useErrorMessage } from '@/shared/errors/use-error-message';
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
import { ConfirmDialog } from '@/shared/ui/confirm-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/shared/ui/dropdown-menu';
import { Spinner } from '@/shared/ui/spinner';

import {
  deviceName,
  deviceSections,
  foundSince,
  isOnline,
  type Device,
  type DeviceSection,
  type KindView,
} from './devices.utils';
import {
  addDevice,
  changeDevice,
  changeDeviceGroups,
  detectDevices,
  forgetDevice,
} from './server/devices-actions';
import { DeviceAccessDialog, type GroupOption } from './ui/device-access-dialog';
import { DeviceNameDialog } from './ui/device-name-dialog';
import { PairingDialog } from './ui/pairing-dialog';

const nowRefreshMs = 30_000;

type Editing =
  | { kind: 'none' }
  | { kind: 'rename'; device: Device }
  | { kind: 'add'; section: DeviceSection }
  | { kind: 'forget'; device: Device }
  | { kind: 'pair'; device: Device }
  | { kind: 'access'; device: Device };

/**
 * The devices Canopy keeps, by plugin and kind: search again, add one by its address, name,
 * hide or forget one, choose the groups allowed on it. Every change is the administrator's and is
 * audited.
 */
export function DevicesContainer({
  kinds,
  initial,
  groups,
}: {
  kinds: readonly KindView[];
  initial: readonly Device[];
  groups: readonly GroupOption[];
}) {
  const t = useTranslations('devices.page');
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const [devices, setDevices] = useState<readonly Device[]>(initial);
  const [editing, setEditing] = useState<Editing>({ kind: 'none' });
  const [pending, startTransition] = useTransition();
  const sections = deviceSections(kinds, devices);

  /** Replaces one kind's devices, here and in the forms that cached them. */
  const replaceKind = (pluginId: string, kind: string, next: readonly Device[]) => {
    setDevices((current) => [
      ...current.filter((device) => device.pluginId !== pluginId || device.kind !== kind),
      ...next,
    ]);
    void queryClient.invalidateQueries({ queryKey: ['devices', pluginId, kind] });
  };
  const replaceOne = (next: Device) => {
    setDevices((current) => current.map((device) => (device.id === next.id ? next : device)));
    void queryClient.invalidateQueries({ queryKey: ['devices', next.pluginId, next.kind] });
  };

  const detection = useMutation({
    mutationFn: async (section: DeviceSection) => ({
      section,
      // The server's clock may differ a little: what it saw from a minute before counts.
      since: Date.now() - 60_000,
      result: await detectDevices({ pluginId: section.pluginId, kind: section.kind }),
    }),
    onSuccess: ({ section, since, result }) => {
      if (!result.ok) {
        toast.error(errorMessage(result.error.code, result.error.params));
        return;
      }
      replaceKind(section.pluginId, section.kind, result.data);
      toast.success(t('found', { count: foundSince(result.data, since) }));
    },
  });

  const change = (device: Device, update: { name?: string; hidden?: boolean }) => {
    startTransition(async () => {
      const result = await changeDevice({ id: device.id, ...update });
      if (!result.ok) {
        toast.error(errorMessage(result.error.code, result.error.params));
        return;
      }
      replaceOne(result.data);
      setEditing({ kind: 'none' });
    });
  };

  const add = (section: DeviceSection, locator: string, name: string) => {
    startTransition(async () => {
      const result = await addDevice({
        pluginId: section.pluginId,
        kind: section.kind,
        locator,
        name,
      });
      if (!result.ok) {
        toast.error(errorMessage(result.error.code, result.error.params));
        return;
      }
      replaceKind(section.pluginId, section.kind, result.data);
      setEditing({ kind: 'none' });
    });
  };

  const restrict = (device: Device, groupIds: string[]) => {
    startTransition(async () => {
      const result = await changeDeviceGroups({ id: device.id, groupIds });
      if (!result.ok) {
        toast.error(errorMessage(result.error.code, result.error.params));
        return;
      }
      replaceOne(result.data);
      setEditing({ kind: 'none' });
    });
  };

  const forget = (device: Device) => {
    startTransition(async () => {
      const result = await forgetDevice({ id: device.id });
      if (!result.ok) {
        toast.error(errorMessage(result.error.code, result.error.params));
        return;
      }
      setDevices((current) => current.filter((item) => item.id !== device.id));
      void queryClient.invalidateQueries({ queryKey: ['devices', device.pluginId, device.kind] });
      setEditing({ kind: 'none' });
    });
  };

  if (sections.length === 0) {
    return <p className="text-muted-foreground text-sm">{t('noKinds')}</p>;
  }

  return (
    <div className="grid gap-4">
      {sections.map((section) => {
        const searching = detection.isPending && detection.variables === section;
        return (
          <Card key={`${section.pluginId}/${section.kind}`}>
            <CardHeader>
              <CardTitle>{section.view?.kindName ?? section.kind}</CardTitle>
              <CardDescription>
                {section.view
                  ? t('fromPlugin', { plugin: section.view.pluginName })
                  : t('orphan', { plugin: section.pluginId })}
              </CardDescription>
              {section.view && (
                <CardAction className="flex flex-wrap justify-end gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={detection.isPending}
                    aria-busy={searching}
                    onClick={() => {
                      detection.mutate(section);
                    }}
                  >
                    {searching ? <Spinner aria-hidden /> : <Radar aria-hidden />}
                    {searching ? t('searching') : t('search')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setEditing({ kind: 'add', section });
                    }}
                  >
                    <Plus aria-hidden />
                    {t('add')}
                  </Button>
                </CardAction>
              )}
            </CardHeader>
            <CardContent>
              {section.devices.length === 0 ? (
                <p className="text-muted-foreground text-sm">{t('empty')}</p>
              ) : (
                <ul className="divide-y rounded-lg border">
                  {section.devices.map((device) => (
                    <DeviceRow
                      key={device.id}
                      device={device}
                      manageable={section.view !== undefined}
                      pairable={section.view?.pairable === true}
                      onPair={() => {
                        setEditing({ kind: 'pair', device });
                      }}
                      onRename={() => {
                        setEditing({ kind: 'rename', device });
                      }}
                      onAccess={() => {
                        setEditing({ kind: 'access', device });
                      }}
                      onToggleHidden={() => {
                        change(device, { hidden: !device.hidden });
                      }}
                      onForget={() => {
                        setEditing({ kind: 'forget', device });
                      }}
                    />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        );
      })}
      <DeviceNameDialog
        key={editing.kind === 'rename' ? editing.device.id : editing.kind}
        open={editing.kind === 'rename' || editing.kind === 'add'}
        mode={editing.kind === 'add' ? 'add' : 'rename'}
        device={editing.kind === 'rename' ? editing.device : null}
        pending={pending}
        onOpenChange={(open) => {
          if (!open) setEditing({ kind: 'none' });
        }}
        onSubmit={({ locator, name }) => {
          if (editing.kind === 'rename') change(editing.device, { name });
          if (editing.kind === 'add') add(editing.section, locator, name);
        }}
      />
      {editing.kind === 'pair' && (
        <PairingDialog
          device={editing.device}
          onClose={() => {
            setEditing({ kind: 'none' });
          }}
          onPaired={replaceOne}
        />
      )}
      {editing.kind === 'access' && (
        <DeviceAccessDialog
          key={editing.device.id}
          device={editing.device}
          groups={groups}
          pending={pending}
          onClose={() => {
            setEditing({ kind: 'none' });
          }}
          onSubmit={(groupIds) => {
            restrict(editing.device, groupIds);
          }}
        />
      )}
      <ConfirmDialog
        open={editing.kind === 'forget'}
        title={t('forgetTitle')}
        description={t('forgetDescription', {
          name: editing.kind === 'forget' ? deviceName(editing.device) : '',
        })}
        confirmLabel={t('forget')}
        destructive
        pending={pending}
        onConfirm={() => {
          if (editing.kind === 'forget') forget(editing.device);
        }}
        onOpenChange={(open) => {
          if (!open) setEditing({ kind: 'none' });
        }}
      />
    </div>
  );
}

interface DeviceRowProps {
  device: Device;
  /** False once the plugin no longer declares the kind: the device can only be forgotten. */
  manageable: boolean;
  /** The plugin pairs this kind: a device asking for it can be paired from here. */
  pairable: boolean;
  onPair: () => void;
  onRename: () => void;
  onAccess: () => void;
  onToggleHidden: () => void;
  onForget: () => void;
}

function DeviceRow(props: DeviceRowProps) {
  const { device, manageable, pairable, onPair, onRename, onAccess, onToggleHidden, onForget } =
    props;
  const t = useTranslations('devices.page');
  const format = useFormatter();
  const now = useNow({ updateInterval: nowRefreshMs }).getTime();
  const online = isOnline(device, now);
  const details = [device.model, device.type].filter((detail) => detail !== null);
  return (
    <li className={cn('flex items-start gap-3 p-3', device.hidden && 'opacity-60')}>
      <span
        aria-hidden
        className={cn(
          'mt-1.5 size-2 shrink-0 rounded-full',
          online ? 'bg-primary' : 'bg-muted-foreground/40',
        )}
      />
      <div className="grid min-w-0 flex-1 gap-0.5">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <span className="truncate">{deviceName(device)}</span>
          {device.customName !== null && (
            <span className="text-muted-foreground truncate text-xs font-normal">
              {device.detectedName}
            </span>
          )}
          {device.needsPairing && <Badge variant="outline">{t('toPair')}</Badge>}
          {device.hidden && <Badge variant="secondary">{t('hidden')}</Badge>}
          {device.groupIds.length > 0 && (
            <Badge variant="outline">
              <Lock aria-hidden />
              {t('restricted')}
            </Badge>
          )}
        </p>
        {details.length > 0 && (
          <p className="text-muted-foreground truncate text-xs">{details.join(' · ')}</p>
        )}
        <p className="text-muted-foreground truncate font-mono text-xs">{device.locator}</p>
        <p className="text-muted-foreground text-xs">
          {online
            ? t('online')
            : device.lastSeen === null
              ? t('neverSeen')
              : t('seen', { when: format.relativeTime(new Date(device.lastSeen), now) })}
        </p>
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            aria-label={t('actions', { name: deviceName(device) })}
          >
            <MoreHorizontal aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {manageable && pairable && device.needsPairing && (
            <DropdownMenuItem onSelect={onPair}>
              <KeyRound aria-hidden />
              {t('pair')}
            </DropdownMenuItem>
          )}
          {manageable && (
            <>
              <DropdownMenuItem onSelect={onRename}>
                <Pencil aria-hidden />
                {t('rename')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onAccess}>
                <UsersRound aria-hidden />
                {t('access')}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={onToggleHidden}>
                {device.hidden ? <Eye aria-hidden /> : <EyeOff aria-hidden />}
                {device.hidden ? t('show') : t('hide')}
              </DropdownMenuItem>
            </>
          )}
          <DropdownMenuItem variant="destructive" onSelect={onForget}>
            <Trash2 aria-hidden />
            {t('forget')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
