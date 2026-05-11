import { loadEnv } from "./config/env.js";
import { createPool } from "./db/pool.js";
import { runMigrations } from "./db/runMigrations.js";

const env = loadEnv();
const pool = createPool(env);
try {
  await runMigrations(pool);
  process.stdout.write("Migrations applied.\n");
} finally {
  await pool.end();
}
