import { cn } from 'cn';
import { Loader2Icon } from 'lucide-react';

// Decorative: the busy control carries `aria-busy` and its own translated label.
function Spinner({ className, ...props }: React.ComponentProps<'svg'>) {
  return (
    <Loader2Icon
      data-slot="spinner"
      aria-hidden
      className={cn('size-4 animate-spin', className)}
      {...props}
    />
  );
}

export { Spinner };
