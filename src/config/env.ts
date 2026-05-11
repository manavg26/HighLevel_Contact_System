import { z } from "zod";

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z
    .string()
    .min(1)
    .default("postgres://contacts:contacts@127.0.0.1:5432/contacts"),
  PHONE_DEFAULT_REGION: z.string().length(2).default("US"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info"),
});

export type Env = z.infer<typeof envSchema>;

export function loadEnv(overrides?: Record<string, string | undefined>): Env {
  return envSchema.parse({ ...process.env, ...overrides });
}
