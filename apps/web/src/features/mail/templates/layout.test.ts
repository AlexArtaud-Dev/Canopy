import { escapeHtml, renderEmail } from './layout';

describe('escapeHtml', () => {
  it('neutralizes markup', () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      '&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;',
    );
  });
});

describe('renderEmail', () => {
  const content = {
    title: 'Hello <Ada>',
    preheader: 'Preview',
    paragraphs: ['First line.', 'Second & last.'],
    action: { label: 'Open', url: 'https://canopy.example/x?a=1&b=2' },
    footer: 'Sent by Canopy.',
  };

  it('escapes every value in the HTML and keeps the link as fallback text', () => {
    const { subject, html } = renderEmail('Subject', content);
    expect(subject).toBe('Subject');
    expect(html).toContain('Hello &lt;Ada&gt;');
    expect(html).toContain('Second &amp; last.');
    expect(html).toContain('href="https://canopy.example/x?a=1&amp;b=2"');
    expect(html).not.toContain('<Ada>');
  });

  it('builds a readable plain-text alternative', () => {
    expect(renderEmail('Subject', content).text).toBe(
      [
        'Hello <Ada>',
        '',
        'First line.',
        '',
        'Second & last.',
        '',
        'Open: https://canopy.example/x?a=1&b=2',
        '',
        '--',
        'Sent by Canopy.',
      ].join('\n'),
    );
  });

  it('works without an action', () => {
    const { html, text } = renderEmail('S', { ...content, action: undefined });
    expect(html).not.toContain('<a href');
    expect(text).not.toContain('Open:');
  });
});
