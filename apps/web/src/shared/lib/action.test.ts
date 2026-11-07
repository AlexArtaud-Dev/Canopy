// jest.mock calls are hoisted above these imports by the SWC transform.
import { runAction } from './action';
import { AppBaseError } from './errors';

jest.mock('server-only', () => ({}));

const errorLog = jest.fn();
jest.mock('@/shared/request/request-context', () => ({
  getRequestContext: () =>
    Promise.resolve({ requestId: 'req-42', clientIp: '10.0.0.1', logger: { error: errorLog } }),
}));

describe('runAction', () => {
  beforeEach(() => {
    errorLog.mockClear();
  });

  it('wraps successful results', async () => {
    await expect(runAction(() => Promise.resolve(7))).resolves.toEqual({ ok: true, data: 7 });
    expect(errorLog).not.toHaveBeenCalled();
  });

  it('returns the error DTO with the request ID and logs the failure', async () => {
    const result = await runAction(() =>
      Promise.reject(new AppBaseError('users.not_found', 'no such user')),
    );
    expect(result).toEqual({
      ok: false,
      error: { code: 'users.not_found', params: {}, requestId: 'req-42' },
    });
    expect(errorLog).toHaveBeenCalledWith(
      'server action failed',
      expect.objectContaining({ code: 'users.not_found' }),
    );
  });
});
