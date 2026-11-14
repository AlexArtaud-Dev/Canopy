/**
 * Canopy's mark drawn for an image response (home screen icons): the tree of `app/icon.svg`. An
 * icon is an image, not a page, so it cannot read the theme tokens; these are the mark's colours.
 */
const leaf = '#6ac79c';
const trunk = '#062015';

interface AppIconProps {
  size: number;
  /**
   * Full-bleed square for launchers that cut their own shape (Android): the tree stays within
   * the central safe zone.
   */
  maskable: boolean;
}

export function AppIcon({ size, maskable }: AppIconProps) {
  const tree = Math.round(size * (maskable ? 0.5 : 0.72));
  return (
    <div
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: leaf,
        borderRadius: maskable ? 0 : Math.round(size * 0.22),
      }}
    >
      <svg width={tree} height={tree} viewBox="0 0 24 24">
        <path d="M12 2.5 4.5 10h15L12 2.5Z" fill={trunk} fillOpacity={0.55} />
        <path d="M12 6.5 3 15.5h18L12 6.5Z" fill={trunk} fillOpacity={0.8} />
        <path d="M12 11 2 21h20L12 11Z" fill={trunk} />
      </svg>
    </div>
  );
}
