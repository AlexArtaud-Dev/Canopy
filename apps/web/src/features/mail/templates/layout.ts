import { themePalette } from '@/shared/theme/theme-palette';

import { emailLook, type EmailLook } from './email-look';

/**
 * Email HTML: inline styles and tables because mail clients ignore stylesheets and CSS variables
 * (design tokens cannot reach an inbox). The look follows the instance's colour theme and surface.
 */
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface EmailContent {
  /** Plain text, already escaped by the caller only through these fields. */
  title: string;
  /** Inbox preview line. */
  preheader: string;
  paragraphs: readonly string[];
  action?: { label: string; url: string } | undefined;
  /** Small print under the card (why you got this email). */
  footer: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/** The look of an instance that has not chosen one: Canopy green, solid panes. */
export const defaultEmailLook: EmailLook = emailLook('solid', themePalette('canopy'));

/** CSS declarations, skipping the ones a look leaves out. */
function css(declarations: Record<string, string | number | null>): string {
  return Object.entries(declarations)
    .filter((entry): entry is [string, string | number] => entry[1] !== null)
    .map(
      ([property, value]) =>
        `${property}:${typeof value === 'number' ? `${String(value)}px` : value}`,
    )
    .join(';');
}

function button(action: { label: string; url: string }, look: EmailLook): string {
  const { background, color, border, radius, glow } = look.button;
  const cell = css({
    'border-radius': radius,
    background,
    border: border ? `1px solid ${border}` : null,
    'box-shadow': glow,
  });
  const link = css({
    display: 'inline-block',
    padding: '12px 22px',
    'font-weight': '600',
    color,
    'text-decoration': 'none',
    'border-radius': radius,
    'font-family': look.headingFont,
    'text-transform': look.headingCase,
    'letter-spacing': look.headingCase === 'uppercase' ? '0.06em' : null,
  });
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td style="${cell}"><a href="${escapeHtml(action.url)}" style="${link}">${escapeHtml(action.label)}</a></td></tr></table>`;
}

function brand(look: EmailLook): string {
  const style = css({
    display: 'inline-block',
    padding: look.brand.background ? '6px 12px' : null,
    'border-radius': look.brand.background ? 999 : null,
    background: look.brand.background,
    color: look.brand.color,
    'font-family': look.headingFont,
    'font-size': 18,
    'font-weight': '700',
    'letter-spacing': look.headingCase === 'uppercase' ? '0.12em' : '-0.01em',
  });
  return `<tr><td style="padding:0 0 16px"><span style="${style}">${escapeHtml(look.brand.label)}</span></td></tr>`;
}

function heading(title: string, look: EmailLook, margin: string): string {
  const style = css({
    margin,
    'font-family': look.headingFont,
    'font-size': 20,
    'line-height': '1.3',
    'font-weight': String(look.headingWeight),
    'text-transform': look.headingCase,
    'letter-spacing': look.headingCase === 'uppercase' ? '0.04em' : null,
    color: look.text,
  });
  return `<h1 style="${style}">${escapeHtml(title)}</h1>`;
}

/** Branded HTML and the matching plain-text alternative (every value escaped). */
export function renderEmail(
  subject: string,
  content: EmailContent,
  look: EmailLook = defaultEmailLook,
): RenderedEmail {
  const paragraphs = content.paragraphs
    .map((paragraph) => `<p style="margin:0 0 16px">${escapeHtml(paragraph)}</p>`)
    .join('');
  const actionHtml = content.action ? button(content.action, look) : '';
  const linkFallback = content.action
    ? `<p style="margin:0;font-size:12px;color:${look.muted};word-break:break-all">${escapeHtml(content.action.url)}</p>`
    : '';
  const titleTile = look.titleTile
    ? `<tr><td style="${css({ background: look.titleTile, 'border-radius': look.cardRadius, padding: '24px 32px' })}">${heading(content.title, look, '0')}</td></tr><tr><td style="height:12px;line-height:12px;font-size:0">&nbsp;</td></tr>`
    : '';
  const topBar = look.cardTopBar
    ? `<tr><td style="height:3px;line-height:3px;font-size:0;background:${look.cardTopBar}">&nbsp;</td></tr>`
    : '';
  const cardStyle = css({
    background: look.card,
    border: look.cardBorder ? `1px solid ${look.cardBorder}` : null,
    'border-radius': look.cardRadius,
    'box-shadow': look.cardShadow,
    padding: '32px',
    'font-size': 15,
    'line-height': '1.6',
    color: look.text,
  });
  // The backdrop sits on the outer table only: clients often drop the body's styles.
  const bodyStyle = css({
    margin: '0',
    'background-color': look.page,
    'font-family': look.font,
    color: look.text,
  });
  const backdrop = css({
    'background-color': look.page,
    'background-image': look.pageImage,
    // A table's height is its minimum: the backdrop fills the window, content stays at the top.
    height: '100vh',
  });
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(subject)}</title></head><body style="${bodyStyle}"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(content.preheader)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${look.page}" style="${backdrop}"><tr><td align="center" valign="top" style="padding:32px 16px;vertical-align:top"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px">${brand(look)}${titleTile}${topBar}<tr><td style="${cardStyle}">${look.titleTile ? '' : heading(content.title, look, '0 0 16px')}${paragraphs}${actionHtml}${linkFallback}</td></tr><tr><td style="padding:16px 4px;font-size:12px;line-height:1.5;color:${look.muted}">${escapeHtml(content.footer)}</td></tr></table></td></tr></table></body></html>`;
  const text = [
    content.title,
    '',
    ...content.paragraphs.flatMap((paragraph) => [paragraph, '']),
    ...(content.action ? [`${content.action.label}: ${content.action.url}`, ''] : []),
    '--',
    content.footer,
  ].join('\n');
  return { subject, html, text };
}
