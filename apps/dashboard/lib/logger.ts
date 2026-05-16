type LogLevel = "info" | "warn" | "error" | "debug";

interface LogPayload {
  [key: string]: unknown;
}

function write(level: LogLevel, event: string, payload: LogPayload = {}) {
  const entry = {
    level,
    event,
    service: "operion-dashboard",
    timestamp: new Date().toISOString(),
    ...payload
  };

  const serialized = JSON.stringify(entry, (_key, value: unknown) =>
    value instanceof Error ? { name: value.name, message: value.message, stack: value.stack } : value
  );

  if (level === "error") {
    console.error(serialized);
    return;
  }

  if (level === "warn") {
    console.warn(serialized);
    return;
  }

  console.log(serialized);
}

export const logger = {
  info: (event: string, payload?: LogPayload) => write("info", event, payload),
  warn: (event: string, payload?: LogPayload) => write("warn", event, payload),
  error: (event: string, payload?: LogPayload) => write("error", event, payload),
  debug: (event: string, payload?: LogPayload) => {
    if (process.env.NODE_ENV !== "production") {
      write("debug", event, payload);
    }
  }
};
