type DuelLogLevel = "debug" | "info" | "warn" | "error" | "silent";

const DUEL_LOG_LEVEL_PRIORITY: Record<DuelLogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
  silent: 4,
};

function normalizeDuelLogLevel(value: string): DuelLogLevel | null {
  switch (value.trim().toLowerCase()) {
    case "debug":
      return "debug";
    case "info":
      return "info";
    case "warn":
    case "warning":
      return "warn";
    case "error":
      return "error";
    case "silent":
    case "off":
    case "none":
      return "silent";
    default:
      return null;
  }
}

function resolveDuelLogLevel(): DuelLogLevel {
  const explicitLevel =
    normalizeDuelLogLevel(process.env.DUEL_AGENT_LOG_LEVEL || "") ||
    normalizeDuelLogLevel(process.env.DUEL_LOG_LEVEL || "") ||
    normalizeDuelLogLevel(process.env.LOG_LEVEL || "") ||
    normalizeDuelLogLevel(process.env.DEFAULT_LOG_LEVEL || "");
  if (explicitLevel) {
    return explicitLevel;
  }

  const quietMode = /^(1|true|yes|on)$/i.test(process.env.DUEL_QUIET || "");
  if (quietMode) {
    return "error";
  }

  return process.env.NODE_ENV === "production" ? "warn" : "info";
}

const resolvedDuelLogLevel = resolveDuelLogLevel();

export function isDuelLogLevelEnabled(level: DuelLogLevel): boolean {
  return (
    DUEL_LOG_LEVEL_PRIORITY[level] >=
    DUEL_LOG_LEVEL_PRIORITY[resolvedDuelLogLevel]
  );
}

function emitDuelLog(
  level: DuelLogLevel,
  scope: string,
  message: string,
  ...args: unknown[]
): void {
  if (!isDuelLogLevelEnabled(level)) {
    return;
  }

  const prefix = `[${scope}] ${message}`;
  if (level === "debug") {
    console.debug(prefix, ...args);
    return;
  }
  if (level === "info") {
    console.info(prefix, ...args);
    return;
  }
  if (level === "warn") {
    console.warn(prefix, ...args);
    return;
  }
  console.error(prefix, ...args);
}

export function duelLogDebug(
  scope: string,
  message: string,
  ...args: unknown[]
): void {
  emitDuelLog("debug", scope, message, ...args);
}

export function duelLogInfo(
  scope: string,
  message: string,
  ...args: unknown[]
): void {
  emitDuelLog("info", scope, message, ...args);
}

export function duelLogWarn(
  scope: string,
  message: string,
  ...args: unknown[]
): void {
  emitDuelLog("warn", scope, message, ...args);
}

export function duelLogError(
  scope: string,
  message: string,
  ...args: unknown[]
): void {
  emitDuelLog("error", scope, message, ...args);
}
