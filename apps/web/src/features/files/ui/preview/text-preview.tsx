'use client';

import { useQuery } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';

import { Alert, AlertDescription } from '@/shared/ui/alert';
import { Spinner } from '@/shared/ui/spinner';

import { codeLanguage, decodeText, textPreviewBytes } from '../../preview.utils';
import { highlight, highlightMaxChars } from './highlight';
import { PreviewMessage } from './preview-message';

interface TextPreviewProps {
  href: string;
  name: string;
  size: number;
}

/** Reads the start of a text file (a range, never the whole of a huge log) and highlights it. */
export function TextPreview({ href, name, size }: TextPreviewProps) {
  const t = useTranslations('files.preview');
  const truncated = size > textPreviewBytes;
  const { data, isError } = useQuery({
    queryKey: ['preview-text', href, size],
    staleTime: Infinity,
    gcTime: 0,
    queryFn: async () => {
      if (size === 0) return { kind: 'text' as const, text: '', html: null };
      const response = await fetch(href, {
        headers: truncated ? { Range: `bytes=0-${String(textPreviewBytes - 1)}` } : {},
      });
      if (!response.ok) throw new Error(String(response.status));
      const decoded = decodeText(new Uint8Array(await response.arrayBuffer()));
      if (decoded.kind === 'binary') return decoded;
      const language = codeLanguage(name);
      const html =
        language && decoded.text.length <= highlightMaxChars
          ? await highlight(decoded.text, language).catch(() => null)
          : null;
      return { ...decoded, html };
    },
  });

  if (isError) return <PreviewMessage title={t('failed')} />;
  if (!data) {
    return (
      <div className="grid h-full place-items-center">
        <Spinner className="size-6" />
      </div>
    );
  }
  if (data.kind === 'binary') return <PreviewMessage title={t('binary')} />;
  return (
    <div className="flex h-full min-h-0 w-full flex-col">
      {truncated && (
        <Alert className="rounded-none border-x-0 border-t-0">
          <AlertDescription>{t('truncated')}</AlertDescription>
        </Alert>
      )}
      <div className="bg-background min-h-0 flex-1 overflow-auto text-xs leading-relaxed">
        {data.html ? (
          // Shiki escapes the file content; the markup is its own spans.
          <div
            className="[&_pre]:min-w-max [&_pre]:p-4 [&_pre]:font-mono"
            dangerouslySetInnerHTML={{ __html: data.html }}
          />
        ) : (
          <pre className="min-w-max p-4 font-mono whitespace-pre">{data.text}</pre>
        )}
      </div>
    </div>
  );
}
