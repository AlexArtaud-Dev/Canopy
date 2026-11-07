export type ServiceState = 'up' | 'down' | 'unknown';

export interface SystemStatus {
  web: ServiceState;
  engine: ServiceState;
  database: ServiceState;
  checkedAt: string;
}

/** Outcome of one readiness probe against the engine, before interpretation. */
export type EngineProbe =
  { kind: 'response'; httpStatus: number; code: string | undefined } | { kind: 'unreachable' };
