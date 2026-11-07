'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ComponentProps } from 'react';

import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

/** Password field with a reveal toggle (helps on phones, where typos are common). */
export function PasswordInput(props: Omit<ComponentProps<typeof Input>, 'type'>) {
  const t = useTranslations('common.password');
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className="pr-10" />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        // Centered by inset + margin: a transform would fight the button's press effect.
        className="text-muted-foreground absolute inset-y-0 right-1 my-auto"
        aria-label={visible ? t('hide') : t('show')}
        aria-pressed={visible}
        onClick={() => {
          setVisible((value) => !value);
        }}
      >
        {visible ? <EyeOff aria-hidden /> : <Eye aria-hidden />}
      </Button>
    </div>
  );
}
