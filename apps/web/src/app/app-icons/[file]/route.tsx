import { ImageResponse } from 'next/og';

import { AppIcon } from '@/features/pwa/ui/app-icon';
import { appIcons, findAppIcon } from '@/features/pwa/pwa.utils';

export const dynamic = 'force-static';

export function generateStaticParams() {
  return appIcons.map((icon) => ({ file: icon.file }));
}

/** The home screen icons the manifest lists, drawn at build time. */
export async function GET(_request: Request, context: { params: Promise<{ file: string }> }) {
  const icon = findAppIcon((await context.params).file);
  if (!icon) return new Response(null, { status: 404 });
  return new ImageResponse(<AppIcon size={icon.size} maskable={icon.maskable} />, {
    width: icon.size,
    height: icon.size,
  });
}
