import pg from "pg";
import type { Env } from "../config/env.js";

export function createPool(env: Env) {
  return new pg.Pool({
    connectionString: env.DATABASE_URL,
    max: 20,
    idleTimeoutMillis: 30_000,
  });
}

export type DbPool = ReturnType<typeof createPool>;
