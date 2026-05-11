import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { DbPool } from "./pool.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runMigrations(pool: DbPool): Promise<void> {
  const sqlPath = join(__dirname, "../../migrations/001_initial.sql");
  const sql = await readFile(sqlPath, "utf8");
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
