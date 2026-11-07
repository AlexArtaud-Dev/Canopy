'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ComponentProps } from 'react';

import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

/** Password field with a reveal toggle (helps on phones, where typos are common). */
export function PasswordInput(props: Omit<ComponentProps<typeof Input>, 'type'>) {
  const t = useTranslations('auth.password');
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative">
      <Input {...props} type={visible ? 'text' : 'password'} className="pr-10" />
      <Button
        type="button"
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground absolute top-1/2 right-1 -translate-y-1/2"
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
