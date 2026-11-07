import { AppBaseError } from './errors';
import { createLogger, levelForEnvironment, logger } from './logger';

function setup(level: 'debug' | 'info' | 'warn' | 'error' = 'debug') {
  const lines: Record<string, unknown>[] = [];
  const logger = createLogger(
    {
      level,
      write: (line) => lines.push(JSON.parse(line) as Record<string, unknown>),
      now: () => new Date('2026-11-07T10:00:00.000Z'),
    },
    { module: 'web' },
  );
  return { logger, lines };
}

describe('createLogger', () => {
  it('writes one JSON line with time, level, message and bindings', () => {
    const { logger, lines } = setup();
    logger.info('started', { requestId: 'r1' });
    expect(lines).toEqual([
      {
        time: '2026-11-07T10:00:00.000Z',
        level: 'info',
        msg: 'started',
        module: 'web',
        requestId: 'r1',
      },
    ]);
  });

  it('drops entries below the configured level', () => {
    const { logger, lines } = setup('warn');
    logger.debug('a');
    logger.info('b');
    logger.warn('c');
    logger.error('d');
    expect(lines.map((line) => line.level)).toEqual(['warn', 'error']);
  });

  it('merges child bindings', () => {
    const { logger, lines } = setup();
    logger.child({ userId: 'u1' }).debug('child');
    expect(lines[0]).toMatchObject({ module: 'web', userId: 'u1', level: 'debug' });
  });

  it('serializes errors with their code and stack', () => {
    const { logger, lines } = setup();
    logger.error('failed', { error: new AppBaseError('files.not_found', 'missing') });
    expect(lines[0]?.error).toMatchObject({
      name: 'AppBaseError',
      message: 'missing',
      code: 'files.not_found',
    });
    expect(lines[0]?.error).toHaveProperty('stack');
  });

  it('keeps plain errors without a code', () => {
    const { logger, lines } = setup();
    logger.error('failed', { error: new Error('boom') });
    expect(lines[0]?.error).toMatchObject({ name: 'Error', message: 'boom' });
  });
});

describe('levelForEnvironment', () => {
  it.each([
    ['production', 'info'],
    ['development', 'debug'],
    ['test', 'debug'],
    [undefined, 'debug'],
  ])('%s → %s', (nodeEnv, expected) => {
    expect(levelForEnvironment(nodeEnv)).toBe(expected);
  });
});

describe('logger without bindings', () => {
  it('only writes the entry fields', () => {
    const lines: string[] = [];
    const bare = createLogger({
      level: 'info',
      write: (line) => lines.push(line),
      now: () => new Date(0),
    });
    bare.info('hello');
    expect(JSON.parse(lines[0] ?? '{}')).toEqual({
      time: '1970-01-01T00:00:00.000Z',
      level: 'info',
      msg: 'hello',
    });
  });
});

describe('default logger', () => {
  it('writes JSON lines tagged with the web module to stdout', () => {
    const write = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    logger.info('ready');
    const [line] = write.mock.calls[0] ?? [];
    write.mockRestore();
    expect(JSON.parse(String(line))).toMatchObject({ level: 'info', msg: 'ready', module: 'web' });
  });
});

describe('AppBaseError', () => {
  it('defaults params to an empty object and keeps the cause', () => {
    const cause = new Error('root');
    const error = new AppBaseError('system.engine_unreachable', 'engine down', { cause });
    expect(error.params).toEqual({});
    expect(error.cause).toBe(cause);
  });
});
