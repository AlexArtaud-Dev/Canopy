/**
 * Email HTML: inline styles and tables because mail clients ignore stylesheets and CSS variables
 * (design tokens cannot reach an inbox). Colors mirror the app's light theme.
 */
const colors = {
  page: '#f5f5f4',
  card: '#ffffff',
  text: '#1c1917',
  muted: '#57534e',
  border: '#e7e5e4',
  brand: '#22a06b',
  brandText: '#ffffff',
} as const;

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

function button(action: { label: string; url: string }): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0"><tr><td style="border-radius:8px;background:${colors.brand}"><a href="${escapeHtml(action.url)}" style="display:inline-block;padding:12px 20px;font-weight:600;color:${colors.brandText};text-decoration:none;border-radius:8px">${escapeHtml(action.label)}</a></td></tr></table>`;
}

/** Branded HTML and the matching plain-text alternative (every value escaped). */
export function renderEmail(subject: string, content: EmailContent): RenderedEmail {
  const paragraphs = content.paragraphs
    .map((paragraph) => `<p style="margin:0 0 16px">${escapeHtml(paragraph)}</p>`)
    .join('');
  const actionHtml = content.action ? button(content.action) : '';
  const linkFallback = content.action
    ? `<p style="margin:0;font-size:12px;color:${colors.muted};word-break:break-all">${escapeHtml(content.action.url)}</p>`
    : '';
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${escapeHtml(subject)}</title></head><body style="margin:0;background:${colors.page};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:${colors.text}"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(content.preheader)}</div><table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px"><tr><td style="padding:0 0 16px;font-size:18px;font-weight:700;letter-spacing:-0.01em">Canopy</td></tr><tr><td style="background:${colors.card};border:1px solid ${colors.border};border-radius:12px;padding:32px;font-size:15px;line-height:1.6"><h1 style="margin:0 0 16px;font-size:20px;line-height:1.3">${escapeHtml(content.title)}</h1>${paragraphs}${actionHtml}${linkFallback}</td></tr><tr><td style="padding:16px 4px;font-size:12px;line-height:1.5;color:${colors.muted}">${escapeHtml(content.footer)}</td></tr></table></td></tr></table></body></html>`;
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
