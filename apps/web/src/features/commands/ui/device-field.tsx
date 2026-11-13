'use client';

import { useQueryClient } from '@tanstack/react-query';
import { KeyRound, Radar } from 'lucide-react';
import { useFormatter, useNow, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { cn } from 'cn';
import { Badge } from '@/shared/ui/badge';
import { Button } from '@/shared/ui/button';
import { Field, FieldDescription, FieldError, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/shared/ui/select';
import { Spinner } from '@/shared/ui/spinner';
import {
  deviceName,
  devicesKey,
  isOnline,
  PairingDialog,
  pickable,
  useDevices,
  type Device,
} from '@/features/devices';

/** The select value that switches to typing a locator. */
const typed = '__typed__';
const nowRefreshMs = 30_000;

interface DeviceFieldProps {
  id: string;
  label: string;
  help: string | undefined;
  pluginId: string;
  kind: string;
  /** The plugin pairs devices of this kind: a device asking for it gets a Pair button. */
  pairable: boolean;
  value: string;
  autoFocus: boolean;
  onChange: (value: string) => void;
}

/**
 * A field taking one of the devices Canopy keeps for a plugin's kind (a screen): picked by name,
 * switched-on ones first. The list is searched again by itself when nothing was found lately; a
 * locator can still be typed for a device never found.
 */
export function DeviceField(props: DeviceFieldProps) {
  const t = useTranslations('commands.page.device');
  const now = useNow({ updateInterval: nowRefreshMs }).getTime();
  const queryClient = useQueryClient();
  const [pairing, setPairing] = useState<Device | null>(null);
  const { devices, searching, error, loadFailed, detect } = useDevices(
    props.pluginId,
    props.kind,
    true,
  );
  const offered = pickable(devices ?? [], now, props.value);
  const known = offered.some((device) => device.locator === props.value);
  const [typing, setTyping] = useState(false);
  const { value, onChange } = props;
  const firstOnline = offered.find((device) => isOnline(device, now))?.locator;

  // An empty field takes the first screen switched on: one click casts to the only TV.
  useEffect(() => {
    if (value === '' && !typing && firstOnline !== undefined) onChange(firstOnline);
  }, [value, typing, firstOnline, onChange]);

  const showTyping = typing || (value !== '' && !known && devices !== undefined);
  const selected = offered.find((device) => device.locator === value);

  return (
    <Field data-invalid={error !== null || loadFailed || undefined}>
      <FieldLabel htmlFor={props.id}>{props.label}</FieldLabel>
      <div className="flex gap-2">
        <Select
          value={showTyping ? typed : known ? value : ''}
          onValueChange={(next) => {
            if (next === typed) {
              setTyping(true);
              onChange('');
              return;
            }
            setTyping(false);
            onChange(next);
          }}
        >
          <SelectTrigger id={props.id} className="min-w-0 flex-1" autoFocus={props.autoFocus}>
            <SelectValue
              placeholder={
                devices === undefined || (searching && offered.length === 0)
                  ? t('loading')
                  : offered.length === 0
                    ? t('none')
                    : t('pick')
              }
            />
          </SelectTrigger>
          <SelectContent>
            {offered.map((device) => (
              <SelectItem key={device.id} value={device.locator}>
                <DeviceRow device={device} now={now} />
              </SelectItem>
            ))}
            <SelectItem value={typed}>
              <span className="text-muted-foreground">{t('typed')}</span>
            </SelectItem>
          </SelectContent>
        </Select>
        <Button
          type="button"
          variant="outline"
          className="shrink-0"
          disabled={searching}
          aria-busy={searching}
          onClick={detect}
        >
          {searching ? <Spinner aria-hidden /> : <Radar aria-hidden />}
          <span className="max-sm:sr-only">{searching ? t('searching') : t('search')}</span>
        </Button>
      </div>
      {showTyping && (
        <Input
          value={value}
          aria-label={t('locator')}
          placeholder="chromecast://192.168.1.42"
          className="font-mono"
          onChange={(event) => {
            onChange(event.target.value);
          }}
        />
      )}
      {selected?.needsPairing === true && (
        <div className="bg-muted/50 flex flex-wrap items-center gap-2 rounded-md border p-2 text-sm">
          <KeyRound aria-hidden className="text-muted-foreground size-4 shrink-0" />
          <span className="min-w-0 flex-1">{t('needsPairing')}</span>
          {props.pairable && (
            <Button
              type="button"
              size="sm"
              onClick={() => {
                setPairing(selected);
              }}
            >
              {t('pair')}
            </Button>
          )}
        </div>
      )}
      {pairing && (
        <PairingDialog
          device={pairing}
          onClose={() => {
            setPairing(null);
          }}
          onPaired={(paired) => {
            queryClient.setQueryData<Device[]>(devicesKey(paired.pluginId, paired.kind), (list) =>
              list?.map((device) => (device.id === paired.id ? paired : device)),
            );
          }}
        />
      )}
      {props.help && <FieldDescription>{props.help}</FieldDescription>}
      {error !== null && <FieldError>{error}</FieldError>}
      {loadFailed && <FieldError>{t('loadFailed')}</FieldError>}
    </Field>
  );
}

function DeviceRow({ device, now }: { device: Device; now: number }) {
  const t = useTranslations('commands.page.device');
  const format = useFormatter();
  const online = isOnline(device, now);
  const details = [device.model ?? device.type].filter((detail) => detail !== null);
  return (
    <span className="flex min-w-0 items-center gap-2">
      <span
        aria-hidden
        className={cn(
          'size-2 shrink-0 rounded-full',
          online ? 'bg-primary' : 'bg-muted-foreground/40',
        )}
      />
      <span className="truncate">{deviceName(device)}</span>
      {details.length > 0 && (
        <span className="text-muted-foreground truncate text-xs">{details.join(' · ')}</span>
      )}
      <span className="text-muted-foreground ml-auto shrink-0 text-xs">
        {online
          ? t('online')
          : device.lastSeen === null
            ? t('neverSeen')
            : t('seen', { when: format.relativeTime(new Date(device.lastSeen), now) })}
      </span>
      {device.needsPairing && (
        <Badge variant="outline" className="shrink-0">
          {t('pairing')}
        </Badge>
      )}
    </span>
  );
}
