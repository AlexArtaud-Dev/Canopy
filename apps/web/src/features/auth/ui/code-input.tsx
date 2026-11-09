'use client';

import { REGEXP_ONLY_DIGITS } from 'input-otp';

import { cn } from 'cn';
import { InputOTP, InputOTPGroup, InputOTPSeparator, InputOTPSlot } from '@/shared/ui/input-otp';

/** Authenticator apps show 6 digits. */
export const appCodeLength = 6;

interface CodeInputProps {
  id: string;
  name: string;
  value: string;
  onChange: (value: string) => void;
  /** Called once the sixth digit is typed or pasted, to submit without a click. */
  onComplete: (code: string) => void;
  invalid?: boolean;
  disabled?: boolean;
  autoFocus?: boolean;
  describedBy?: string;
}

const slot = 'size-11 text-lg font-medium sm:size-12';

/**
 * One box per digit over a single real input: typing, Backspace, arrows, paste and the phone's
 * one-time-code suggestion all behave as in a normal field.
 */
export function CodeInput({
  id,
  name,
  value,
  onChange,
  onComplete,
  invalid = false,
  disabled = false,
  autoFocus = false,
  describedBy,
}: CodeInputProps) {
  const invalidSlot = invalid && 'border-destructive';
  return (
    <InputOTP
      id={id}
      name={name}
      maxLength={appCodeLength}
      pattern={REGEXP_ONLY_DIGITS}
      inputMode="numeric"
      autoComplete="one-time-code"
      value={value}
      onChange={onChange}
      onComplete={onComplete}
      disabled={disabled}
      autoFocus={autoFocus}
      aria-invalid={invalid || undefined}
      aria-describedby={describedBy}
      containerClassName="gap-2"
    >
      <InputOTPGroup>
        {[0, 1, 2].map((index) => (
          <InputOTPSlot key={index} index={index} className={cn(slot, invalidSlot)} />
        ))}
      </InputOTPGroup>
      <InputOTPSeparator />
      <InputOTPGroup>
        {[3, 4, 5].map((index) => (
          <InputOTPSlot key={index} index={index} className={cn(slot, invalidSlot)} />
        ))}
      </InputOTPGroup>
    </InputOTP>
  );
}
