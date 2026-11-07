import { AppBaseError, isErrorCode, toErrorDto, unexpectedErrorCode } from './errors';

describe('isErrorCode', () => {
  it.each([
    ['files.not_found', true],
    ['system.unexpected', true],
    ['Files.NotFound', false],
    ['files', false],
    ['files.not.found', false],
  ])('%s → %s', (value, expected) => {
    expect(isErrorCode(value)).toBe(expected);
  });
});

describe('toErrorDto', () => {
  it('keeps the code and params of application errors', () => {
    const error = new AppBaseError('files.too_large', 'upload over limit', { params: { max: 10 } });
    expect(toErrorDto(error, 'req-1')).toEqual({
      code: 'files.too_large',
      params: { max: 10 },
      requestId: 'req-1',
    });
  });

  it.each([
    ['a plain error', new Error('ECONNREFUSED 10.0.0.5:5432')],
    ['a string', 'boom'],
    ['a malformed code', new AppBaseError('Not A Code', 'x')],
  ])('hides %s behind system.unexpected', (_label, error) => {
    expect(toErrorDto(error, 'req-2')).toEqual({
      code: unexpectedErrorCode,
      params: {},
      requestId: 'req-2',
    });
  });
});
