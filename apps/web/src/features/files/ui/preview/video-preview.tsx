'use client';

import { useQuery } from '@tanstack/react-query';
import { Maximize, Pause, Play, Volume2, VolumeX } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';

import type { MediaInfo } from '@canopy/contracts';

import { Button } from '@/shared/ui/button';
import { Slider } from '@/shared/ui/slider';
import { Spinner } from '@/shared/ui/spinner';

import { convertedVideoHref, previewHref } from '../../operations.utils';
import { formatTimecode } from '../../preview.utils';
import type { BrowserEntry } from '../../server/browse';
import { loadMediaInfo } from '../../server/media';
import { PreviewMessage } from './preview-message';

/** Without an answer from the engine, the stored file is tried as is. */
const playAsStored: MediaInfo = { mode: 'direct', streamable: false, duration: 0 };

interface VideoPreviewProps {
  entry: BrowserEntry;
  onDownload: () => void;
}

/**
 * Plays a video as stored when the browser can, otherwise converted by the engine. The engine
 * says up front which codecs need it; a native playback error also falls back to it.
 */
export function VideoPreview({ entry, onDownload }: VideoPreviewProps) {
  const t = useTranslations('files.preview');
  const [nativeFailed, setNativeFailed] = useState(false);
  const info = useQuery({
    queryKey: ['files', 'media-info', entry.path, entry.modified],
    queryFn: async () => {
      const result = await loadMediaInfo({ path: entry.path });
      return result.ok ? result.data : playAsStored;
    },
    staleTime: Infinity,
    retry: false,
  });

  if (info.isPending) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner className="size-6" />
      </div>
    );
  }
  const media = info.data ?? playAsStored;
  const converted = media.streamable && (media.mode !== 'direct' || nativeFailed);
  if (converted) return <ConvertedVideo entry={entry} duration={media.duration} />;
  if (nativeFailed) {
    return (
      <PreviewMessage
        title={t('videoUnplayable')}
        action={<Button onClick={onDownload}>{t('download')}</Button>}
      />
    );
  }
  return (
    <video
      src={previewHref(entry.path)}
      controls
      playsInline
      className="size-full object-contain"
      onError={() => {
        setNativeFailed(true);
      }}
    />
  );
}

/**
 * A converted stream cannot seek: the seek bar asks the engine for a new stream from the chosen
 * time, and positions are that start plus the time played since.
 */
function ConvertedVideo({ entry, duration }: { entry: BrowserEntry; duration: number }) {
  const t = useTranslations('files.preview');
  const frame = useRef<HTMLDivElement>(null);
  const video = useRef<HTMLVideoElement>(null);
  const [start, setStart] = useState(0);
  const [played, setPlayed] = useState(0);
  const [dragging, setDragging] = useState<number | null>(null);
  const [playing, setPlaying] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [muted, setMuted] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  if (failed) {
    return (
      <PreviewMessage
        title={t('videoFailed')}
        action={
          <Button
            onClick={() => {
              setFailed(false);
              setAttempt((count) => count + 1);
            }}
          >
            {t('retry')}
          </Button>
        }
      />
    );
  }

  const position = dragging ?? start + played;
  const seek = (target: number) => {
    setDragging(null);
    setPlayed(0);
    setStart(target);
  };
  const togglePlay = () => {
    const element = video.current;
    if (!element) return;
    if (element.paused) void element.play().catch(() => undefined);
    else element.pause();
  };

  return (
    <div ref={frame} className="bg-background flex size-full flex-col">
      <div className="relative min-h-0 flex-1">
        <video
          key={`${start}-${attempt}`}
          ref={video}
          src={convertedVideoHref(entry.path, start)}
          // After a seek or a retry, playback carries on by itself.
          autoPlay={start > 0 || attempt > 0}
          muted={muted}
          playsInline
          className="size-full object-contain"
          onClick={togglePlay}
          onTimeUpdate={(event) => {
            setPlayed(event.currentTarget.currentTime);
          }}
          onPlay={() => {
            setPlaying(true);
          }}
          onPause={() => {
            setPlaying(false);
          }}
          onWaiting={() => {
            setWaiting(true);
          }}
          onPlaying={() => {
            setWaiting(false);
          }}
          onError={() => {
            setFailed(true);
          }}
        />
        {waiting && (
          <div className="pointer-events-none absolute inset-0 grid place-items-center">
            <Spinner className="size-8" />
          </div>
        )}
      </div>
      <div className="flex items-center gap-2 border-t px-2 py-1.5">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={playing ? t('pause') : t('play')}
          onClick={togglePlay}
        >
          {playing ? <Pause aria-hidden /> : <Play aria-hidden />}
        </Button>
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {formatTimecode(position)}
        </span>
        <Slider
          className="flex-1"
          aria-label={t('position')}
          valueText={formatTimecode(position)}
          min={0}
          max={Math.max(duration, 1)}
          step={1}
          disabled={duration <= 0}
          value={[Math.min(position, duration)]}
          onValueChange={([value]) => {
            setDragging(value ?? 0);
          }}
          onValueCommit={([value]) => {
            seek(Math.min(value ?? 0, Math.max(duration - 1, 0)));
          }}
        />
        <span className="text-muted-foreground shrink-0 text-xs tabular-nums">
          {formatTimecode(duration)}
        </span>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={muted ? t('unmute') : t('mute')}
          aria-pressed={muted}
          onClick={() => {
            setMuted((value) => !value);
          }}
        >
          {muted ? <VolumeX aria-hidden /> : <Volume2 aria-hidden />}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('fullscreen')}
          onClick={() => {
            if (document.fullscreenElement) void document.exitFullscreen();
            else void frame.current?.requestFullscreen().catch(() => undefined);
          }}
        >
          <Maximize aria-hidden />
        </Button>
        <span className="sr-only">{t('converted')}</span>
      </div>
    </div>
  );
}
