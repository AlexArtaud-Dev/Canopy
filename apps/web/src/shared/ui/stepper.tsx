import { cn } from 'cn';
import { Check } from 'lucide-react';

export interface StepperStep {
  id: string;
  label: string;
}

interface StepperProps {
  steps: readonly StepperStep[];
  /** Index of the current step; earlier steps show as completed. */
  current: number;
  /** Accessible name of the list (e.g. "Setup progress"). */
  label: string;
  className?: string;
}

/**
 * Read-only progress indicator for multi-step flows (wizards, imports). Each label sits centered
 * under its number; connectors run between the circles.
 */
export function Stepper({ steps, current, label, className }: StepperProps) {
  return (
    <ol aria-label={label} className={cn('flex w-full items-start', className)}>
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;
        return (
          <li
            key={step.id}
            aria-current={active ? 'step' : undefined}
            className="relative flex flex-1 flex-col items-center gap-2"
          >
            {index < steps.length - 1 && (
              <span
                aria-hidden
                className={cn(
                  'absolute top-3.5 right-[calc(-50%+1.25rem)] left-[calc(50%+1.25rem)] h-px',
                  done ? 'bg-primary' : 'bg-border',
                )}
              />
            )}
            <span
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors',
                done && 'border-primary bg-primary text-primary-foreground',
                active && 'border-primary text-primary ring-primary/20 ring-4',
                !done && !active && 'text-muted-foreground',
              )}
            >
              {done ? <Check className="size-3.5" aria-hidden /> : index + 1}
            </span>
            <span
              className={cn(
                'text-center text-xs',
                active ? 'text-foreground font-medium' : 'text-muted-foreground',
              )}
            >
              {step.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
