import { ImageResponse } from 'next/og';

import { AppIcon } from '@/features/pwa/ui/app-icon';

export const size = { width: 180, height: 180 };
export const contentType = 'image/png';

/** The icon iOS puts on the home screen (it rounds the corners itself). */
export default function AppleIcon() {
  return new ImageResponse(<AppIcon size={size.width} maskable />, size);
}
