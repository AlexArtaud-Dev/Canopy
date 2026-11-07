import {
  auditExportLimit,
  auditFiltersSchema,
  auditPageSize,
  csvCell,
  csvRow,
  dateRange,
  filtersQuery,
} from './audit-view.utils';

describe('auditFiltersSchema', () => {
  it('keeps valid filters and drops junk', () => {
    expect(
      auditFiltersSchema.parse({
        actor: ' ada ',
        result: 'denied',
        from: '2026-01-01',
        to: 'yesterday',
        page: '3',
      }),
    ).toEqual({ actor: 'ada', result: 'denied', from: '2026-01-01', to: undefined, page: 3 });
    expect(auditFiltersSchema.parse({ result: 'maybe', page: '-1' })).toEqual({
      result: undefined,
      page: 1,
    });
  });
});

describe('dateRange', () => {
  it('covers whole UTC days', () => {
    expect(dateRange({ from: '2026-01-01', to: '2026-01-02' })).toEqual({
      start: new Date('2026-01-01T00:00:00.000Z'),
      end: new Date('2026-01-02T23:59:59.999Z'),
    });
    expect(dateRange({})).toEqual({ start: null, end: null });
  });
});

describe('csv', () => {
  it('quotes cells and doubles quotes', () => {
    expect(csvCell('say "hi"')).toBe('"say ""hi"""');
    expect(csvCell(null)).toBe('""');
  });

  it.each(['=SUM(A1)', '+1', '-2', '@cmd', '\tx', '\rx'])('neutralizes formula %j', (value) => {
    expect(csvCell(value).startsWith(`"'`)).toBe(true);
  });

  it('joins a row', () => {
    expect(csvRow(['a', undefined, 'b'])).toBe('"a","","b"');
  });
});

describe('filtersQuery', () => {
  it('serializes non-empty filters and the page', () => {
    expect(filtersQuery({ page: 1, action: 'auth.sign_in', actor: '' }, 2)).toBe(
      '?action=auth.sign_in&page=2',
    );
    expect(filtersQuery({ page: 1 }, 1)).toBe('');
  });
});

describe('limits', () => {
  it('pages by 50 and caps exports', () => {
    expect([auditPageSize, auditExportLimit]).toEqual([50, 10_000]);
  });
});
