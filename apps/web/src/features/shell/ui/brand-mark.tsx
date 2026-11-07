/** Canopy mark: three stacked tree crowns. Colors come from the current text/primary tokens. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden className={className}>
      <path d="M12 2.5 4.5 10h15L12 2.5Z" fill="currentColor" opacity="0.55" />
      <path d="M12 6.5 3 15.5h18L12 6.5Z" fill="currentColor" opacity="0.8" />
      <path d="M12 11 2 21h20L12 11Z" fill="currentColor" />
    </svg>
  );
}
