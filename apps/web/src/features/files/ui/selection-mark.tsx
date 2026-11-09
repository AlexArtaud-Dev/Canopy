import { CheckIcon } from 'lucide-react';

import { cn } from 'cn';

interface SelectionMarkProps {
  checked: boolean;
  className?: string;
  onToggle: () => void;
}

/**
 * The checkbox look of a selectable row, for pointer and touch. It is not a control of its own:
 * the row is the `option` (its `aria-selected` carries the state, Space toggles it), and a
 * focusable checkbox inside it would be nested interactive content.
 */
export function SelectionMark({ checked, className, onToggle }: SelectionMarkProps) {
  return (
    <span
      aria-hidden
      data-checked={checked || undefined}
      className={cn(
        'border-input data-checked:border-primary data-checked:bg-primary data-checked:text-primary-foreground dark:bg-input/30 dark:data-checked:bg-primary relative flex size-4 shrink-0 items-center justify-center rounded-[4px] border transition-colors after:absolute after:-inset-x-3 after:-inset-y-2',
        className,
      )}
      onClick={(event) => {
        event.stopPropagation();
        onToggle();
      }}
    >
      {checked && <CheckIcon className="size-3.5" />}
    </span>
  );
}
