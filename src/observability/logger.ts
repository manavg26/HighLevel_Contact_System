import pino from "pino";
import type { Env } from "../config/env.js";

const redactPaths = [
  "email",
  "emailNormalized",
  "phoneNumber",
  "phoneE164",
  "req.headers.authorization",
];

export function createLogger(env: Env) {
  return pino({
    level: env.LOG_LEVEL,
    redact: {
      paths: redactPaths,
      censor: "[REDACTED]",
    },
    formatters: {
      level(label) {
        return { level: label };
      },
    },
    base: { service: "contact-ingestion" },
  });
}

export type AppLogger = ReturnType<typeof createLogger>;
