/**
 * Tiny logger with a module prefix and level filter.
 * Kept logic-layer safe (no DOM dependency).
 */
export type LogLevel = "debug" | "info" | "warn" | "error" | "silent";

const ORDER: Record<LogLevel, number> = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };

let globalLevel: LogLevel = "info";

export function setLogLevel(level: LogLevel): void {
  globalLevel = level;
}

export function getLogLevel(): LogLevel {
  return globalLevel;
}

const WARNED = new Set<string>();

/** Warn once per key (used for unknown config fields). */
export function warnOnce(key: string, message: string): void {
  if (WARNED.has(key)) return;
  WARNED.add(key);
  log.warn(message);
}

export function createLogger(scope: string) {
  const tag = `[${scope}]`;
  return {
    debug: (...args: unknown[]) => emit("debug", tag, args),
    info: (...args: unknown[]) => emit("info", tag, args),
    warn: (...args: unknown[]) => emit("warn", tag, args),
    error: (...args: unknown[]) => emit("error", tag, args),
  };
}

export const log = createLogger("matchface");

function emit(level: LogLevel, tag: string, args: unknown[]): void {
  if (ORDER[level] < ORDER[globalLevel]) return;
  const c = console as unknown as Record<string, (...a: unknown[]) => void>;
  const fn = c[level] ?? c.log;
  fn(tag, ...args);
}
