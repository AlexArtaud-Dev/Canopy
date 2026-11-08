'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition, type SubmitEvent } from 'react';

import type { FormErrorContent } from '@/shared/errors/form-error';
import { FormError } from '@/shared/errors/form-error';
import { Button } from '@/shared/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/shared/ui/dialog';
import { Field, FieldLabel } from '@/shared/ui/field';
import { Input } from '@/shared/ui/input';
import { Spinner } from '@/shared/ui/spinner';

import { entryNameSchema } from '../operations.utils';

interface NameDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  submitLabel: string;
  initialName: string;
  /** Characters preselected, so typing replaces the name but keeps the extension. */
  selectionEnd: number;
  /** Resolves to an error to show, or null once done. */
  onSubmit: (name: string) => Promise<FormErrorContent | null>;
}

/** Asks for one entry name (new folder, rename) and shows the engine's refusal inline. */
export function NameDialog(props: NameDialogProps) {
  const t = useTranslations('files.browser.ops');
  const [name, setName] = useState(props.initialName);
  const [error, setError] = useState<FormErrorContent | null>(null);
  const [pending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const valid = entryNameSchema.safeParse(name).success;

  useEffect(() => {
    if (!props.open) return;
    const frame = requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(0, props.selectionEnd);
    });
    return () => {
      cancelAnimationFrame(frame);
    };
  }, [props.open, props.selectionEnd]);

  const submit = (event: SubmitEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!valid) return;
    startTransition(async () => {
      const refusal = await props.onSubmit(entryNameSchema.parse(name));
      setError(refusal);
      if (!refusal) props.onOpenChange(false);
    });
  };

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="grid gap-4">
          <DialogHeader>
            <DialogTitle>{props.title}</DialogTitle>
            <DialogDescription>{props.description}</DialogDescription>
          </DialogHeader>
          {error && <FormError error={error} />}
          <Field>
            <FieldLabel htmlFor="entry-name">{t('name')}</FieldLabel>
            <Input
              id="entry-name"
              ref={inputRef}
              value={name}
              maxLength={255}
              autoComplete="off"
              aria-invalid={name !== '' && !valid}
              onChange={(event) => {
                setName(event.target.value);
              }}
            />
          </Field>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                props.onOpenChange(false);
              }}
            >
              {t('cancel')}
            </Button>
            <Button type="submit" disabled={!valid || pending}>
              {pending && <Spinner data-icon="inline-start" />}
              {props.submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
