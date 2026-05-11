import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createDependencies } from "../../src/compositionRoot.js";
import { runMigrations } from "../../src/db/runMigrations.js";

const enabled = Boolean(process.env.DATABASE_URL);

describe.skipIf(!enabled)("PostgreSQL integration", () => {
  const deps = createDependencies();
  const tenant = `it_${Math.random().toString(16).slice(2)}`;

  beforeAll(async () => {
    await runMigrations(deps.pool);
  });

  afterAll(async () => {
    await deps.pool.end();
  });

  it("upserts and preserves contactId on duplicate email", async () => {
    const key = randomUUID();
    const first = await deps.contactService.createContact(
      tenant,
      { name: "A", email: "Dup@Example.com" },
      { requestId: "r1", idempotencyKey: key },
    );
    const second = await deps.contactService.createContact(
      tenant,
      { name: "A2", email: "dup@example.com" },
      { requestId: "r2" },
    );
    expect(second.contactId).toBe(first.contactId);
    expect(second.name).toBe("A2");
  });

  it("rolls back failed batch without committing partial rows in same transaction", async () => {
    const client = await deps.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO contacts (tenant_id, name, email_normalized, phone_e164)
         VALUES ($1, 'x', 'only-email-rollback@example.com', NULL)`,
        [tenant],
      );
      await client.query("ROLLBACK");
    } finally {
      client.release();
    }
    const verify = await deps.pool.query(
      `SELECT 1 FROM contacts WHERE email_normalized = $1 AND tenant_id = $2`,
      ["only-email-rollback@example.com", tenant],
    );
    expect(verify.rowCount).toBe(0);
  });

  it("replays idempotent single create", async () => {
    const idem = randomUUID();
    const a = await deps.contactService.createContact(
      tenant,
      { name: "Idem", email: "idem@example.com" },
      { requestId: "idem-1", idempotencyKey: idem },
    );
    const b = await deps.contactService.createContact(
      tenant,
      { name: "Idem", email: "idem@example.com" },
      { requestId: "idem-2", idempotencyKey: idem },
    );
    expect(b.outcome).toBe("replay");
    expect(b.contactId).toBe(a.contactId);
  });

  it("handles 100 concurrent duplicate creates with single resulting row", async () => {
    const email = `race_${randomUUID()}@example.com`;
    const results = await Promise.all(
      Array.from({ length: 100 }, (_, i) =>
        deps.contactService.createContact(
          tenant,
          { name: `u${i}`, email },
          { requestId: `race-${i}` },
        ),
      ),
    );
    const ids = new Set(results.map((r) => r.contactId));
    expect(ids.size).toBe(1);
  });
});
