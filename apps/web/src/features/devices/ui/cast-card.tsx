'use client';

import { FastForward, Pause, Play, Rewind, Square, Volume2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { toast } from 'sonner';

import { useErrorMessage } from '@/shared/errors/use-error-message';
import { Button } from '@/shared/ui/button';
import { Slider } from '@/shared/ui/slider';
import { Spinner } from '@/shared/ui/spinner';

import { deviceName, formatClock, type ControlInput } from '../devices.utils';
import type { LiveCast } from '../model/use-casts';
import { useDevices } from '../model/use-devices';
import { sendControl } from '../server/remote-actions';

/** Seconds a jump back or forward moves. */
const jump = 30;

type Control =
  | { action: 'pause' | 'resume' | 'stop' }
  | { action: 'seek'; seconds: number }
  | { action: 'volume'; level: number };

/** One cast playing: what, where, how far, and the buttons that drive it. */
export function CastCard({ cast }: { cast: LiveCast }) {
  const t = useTranslations('devices.remote');
  const errorMessage = useErrorMessage();
  const { devices } = useDevices(cast.run.pluginId, cast.run.kind, false);
  const device = devices?.find((item) => item.locator === cast.run.locator);
  const [pending, setPending] = useState<string | null>(null);
  // While a slider moves, it shows where it is rather than where the film was.
  const [seeking, setSeeking] = useState<number | null>(null);
  const [volume, setVolume] = useState<number | null>(null);
  const state = cast.state;
  const title = cast.run.file.split('/').pop() ?? cast.run.file;
  const position = seeking ?? state?.position ?? 0;
  const duration = state?.duration ?? null;
  const knownVolume = state?.volume ?? null;

  const send = async (control: Control) => {
    setPending(control.action);
    const result = await sendControl({ jobId: cast.job.id, ...control } satisfies ControlInput);
    setPending(null);
    if (!result.ok) toast.error(errorMessage(result.error.code, result.error.params));
  };

  return (
    <article className="grid gap-3 rounded-xl border p-4">
      <div className="grid gap-0.5">
        <p className="truncate font-medium" title={cast.run.file}>
          {title}
        </p>
        <p className="text-muted-foreground truncate text-sm">
          {device ? deviceName(device) : cast.run.locator}
          {' · '}
          {/* i18n-dynamic: devices.remote.state */}
          {state ? t(`state.${state.state}`) : t('starting')}
        </p>
      </div>

      {duration !== null && (
        <div className="grid gap-1.5">
          <Slider
            value={[position]}
            min={0}
            max={Math.max(duration, 1)}
            step={1}
            aria-label={t('position')}
            onValueChange={([value]) => {
              setSeeking(value ?? null);
            }}
            onValueCommit={([value]) => {
              setSeeking(null);
              if (value !== undefined) void send({ action: 'seek', seconds: value });
            }}
          />
          <p className="text-muted-foreground flex justify-between text-xs tabular-nums">
            <span>{formatClock(position)}</span>
            <span>{formatClock(duration)}</span>
          </p>
        </div>
      )}

      <div className="flex items-center justify-center gap-2">
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('back', { seconds: jump })}
          disabled={!state || pending !== null}
          onClick={() => void send({ action: 'seek', seconds: Math.max(0, position - jump) })}
        >
          <Rewind aria-hidden />
        </Button>
        <Button
          size="icon-lg"
          className="rounded-full"
          aria-label={state?.state === 'paused' ? t('resume') : t('pause')}
          disabled={!state || pending !== null}
          onClick={() => void send({ action: state?.state === 'paused' ? 'resume' : 'pause' })}
        >
          {pending === 'pause' || pending === 'resume' ? (
            <Spinner aria-hidden />
          ) : state?.state === 'paused' ? (
            <Play aria-hidden />
          ) : (
            <Pause aria-hidden />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          aria-label={t('forward', { seconds: jump })}
          disabled={!state || pending !== null}
          onClick={() =>
            void send({
              action: 'seek',
              seconds:
                duration === null ? position + jump : Math.min(duration - 1, position + jump),
            })
          }
        >
          <FastForward aria-hidden />
        </Button>
        <Button
          variant="outline"
          size="icon"
          className="ms-2"
          aria-label={t('stop')}
          disabled={pending !== null}
          onClick={() => void send({ action: 'stop' })}
        >
          {pending === 'stop' ? <Spinner aria-hidden /> : <Square aria-hidden />}
        </Button>
      </div>

      {knownVolume !== null && (
        <div className="flex items-center gap-3">
          <Volume2 aria-hidden className="text-muted-foreground size-4 shrink-0" />
          <Slider
            value={[volume ?? knownVolume]}
            min={0}
            max={100}
            step={1}
            aria-label={t('volume')}
            onValueChange={([value]) => {
              setVolume(value ?? null);
            }}
            onValueCommit={([value]) => {
              setVolume(null);
              if (value !== undefined) void send({ action: 'volume', level: value });
            }}
          />
        </div>
      )}
      {state?.volume === null && (
        <p className="text-muted-foreground text-xs">{t('volumeOnScreen')}</p>
      )}
    </article>
  );
}
