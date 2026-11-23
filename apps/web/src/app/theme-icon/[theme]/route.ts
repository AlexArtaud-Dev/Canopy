import { z } from 'zod';

import { colorThemes } from '@/shared/theme/color-themes';
import { themeIconSvg } from '@/shared/theme/theme-icon';

export const dynamic = 'force-static';

export function generateStaticParams() {
  return colorThemes.map((theme) => ({ theme }));
}

const themeSchema = z.enum(colorThemes);

/** The tab icon in a colour theme; the root layout points to the instance's theme. */
export async function GET(_request: Request, context: { params: Promise<{ theme: string }> }) {
  const theme = themeSchema.safeParse((await context.params).theme);
  if (!theme.success) return new Response(null, { status: 404 });
  return new Response(themeIconSvg(theme.data), {
    headers: {
      'Content-Type': 'image/svg+xml',
      'Cache-Control': 'public, max-age=86400',
    },
  });
}
