'use client';

import { Search, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';

import { cn } from 'cn';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

import { searchMaxLength, searchMinLength } from '../browser.utils';

/** Typing pauses this long before searching (the engine walks the tree for each search). */
const debounceMs = 300;

interface SearchBoxProps {
  /** The words in the URL; changing folder clears them. */
  value: string;
  onSearch: (q: string) => void;
  className?: string;
}

/** Searches names under the current folder as you type; Escape clears. */
export function SearchBox({ value, onSearch, className }: SearchBoxProps) {
  const t = useTranslations('files.browser.search');
  const [text, setText] = useState(value);
  const [synced, setSynced] = useState(value);
  // The URL changed on its own (another folder, back button): show its words.
  if (value !== synced) {
    setSynced(value);
    setText(value);
  }

  useEffect(() => {
    const q = text.trim();
    // One letter would match nearly everything: wait for a second one.
    if (q === value || (q.length > 0 && q.length < searchMinLength)) return;
    const timer = window.setTimeout(() => {
      onSearch(q);
    }, debounceMs);
    return () => {
      window.clearTimeout(timer);
    };
  }, [text, value, onSearch]);

  return (
    <div className={cn('relative', className)}>
      <Search
        className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2"
        aria-hidden
      />
      <Input
        type="search"
        value={text}
        maxLength={searchMaxLength}
        placeholder={t('placeholder')}
        aria-label={t('label')}
        className="h-8 pr-8 pl-8 [&::-webkit-search-cancel-button]:hidden"
        onChange={(event) => {
          setText(event.target.value);
        }}
        onKeyDown={(event) => {
          if (event.key === 'Escape' && text) {
            event.preventDefault();
            setText('');
          }
        }}
      />
      {text && (
        <Button
          variant="ghost"
          size="icon-xs"
          className="absolute top-1/2 right-1 -translate-y-1/2"
          aria-label={t('clear')}
          onClick={() => {
            setText('');
          }}
        >
          <X aria-hidden />
        </Button>
      )}
    </div>
  );
}
