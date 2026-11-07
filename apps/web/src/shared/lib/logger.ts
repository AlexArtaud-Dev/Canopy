export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export type LogMeta = Record<string, unknown>;

export interface Logger {
  debug(message: string, meta?: LogMeta): void;
  info(message: string, meta?: LogMeta): void;
  warn(message: string, meta?: LogMeta): void;
  error(message: string, meta?: LogMeta): void;
  child(bindings: LogMeta): Logger;
}

const levelRank: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

interface LoggerOptions {
  level: LogLevel;
  write: (line: string) => void;
  now: () => Date;
}

function serializeError(value: unknown): unknown {
  if (!(value instanceof Error)) {
    return value;
  }
  const code: unknown = 'code' in value ? value.code : undefined;
  return { name: value.name, message: value.message, code, stack: value.stack };
}

/**
 * JSON-lines logger shaped like the engine's slog output so both streams can be merged.
 * Clock and sink are injected to keep it pure for tests.
 */
export function createLogger(options: LoggerOptions, bindings: LogMeta = {}): Logger {
  const log = (level: LogLevel, message: string, meta: LogMeta = {}): void => {
    if (levelRank[level] < levelRank[options.level]) {
      return;
    }
    const fields = Object.fromEntries(
      Object.entries({ ...bindings, ...meta }).map(([key, value]) => [key, serializeError(value)]),
    );
    options.write(
      JSON.stringify({ time: options.now().toISOString(), level, msg: message, ...fields }),
    );
  };

  return {
    debug: (message, meta) => {
      log('debug', message, meta);
    },
    info: (message, meta) => {
      log('info', message, meta);
    },
    warn: (message, meta) => {
      log('warn', message, meta);
    },
    error: (message, meta) => {
      log('error', message, meta);
    },
    child: (childBindings) => createLogger(options, { ...bindings, ...childBindings }),
  };
}

/** Production keeps debug noise out of the logs; every other environment shows it. */
export function levelForEnvironment(nodeEnv: string | undefined): LogLevel {
  return nodeEnv === 'production' ? 'info' : 'debug';
}

export const logger = createLogger(
  {
    level: levelForEnvironment(process.env.NODE_ENV),
    write: (line) => process.stdout.write(`${line}\n`),
    now: () => new Date(),
  },
  { module: 'web' },
);
