import type pg from "pg";
import { ConflictError } from "../domain/errors.js";
import type { ContactRow, ContactUpsertOutcome } from "../domain/contact.js";
import type { AppMetrics } from "../observability/metrics.js";

type ContactDbRow = {
  contact_id: string;
  tenant_id: string;
  name: string;
  email_normalized: string | null;
  phone_e164: string | null;
  created_at: Date;
  updated_at: Date;
};

function mapRow(r: ContactDbRow): ContactRow {
  return {
    contactId: r.contact_id,
    tenantId: r.tenant_id,
    name: r.name,
    emailNormalized: r.email_normalized,
    phoneE164: r.phone_e164,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export class ContactRepository {
  constructor(private readonly metrics: AppMetrics) {}

  async findById(
    client: pg.PoolClient,
    contactId: string,
  ): Promise<ContactRow | null> {
    const end = this.metrics.dbLatencySeconds.startTimer({
      operation: "findById",
    });
    try {
      const res = await client.query<ContactDbRow>(
        `SELECT contact_id, tenant_id, name, email_normalized, phone_e164, created_at, updated_at
         FROM contacts WHERE contact_id = $1`,
        [contactId],
      );
      const row = res.rows[0];
      if (!row) return null;
      return mapRow(row);
    } finally {
      end();
    }
  }

  async findByIdForTenant(
    client: pg.PoolClient,
    tenantId: string,
    contactId: string,
  ): Promise<ContactRow | null> {
    const end = this.metrics.dbLatencySeconds.startTimer({
      operation: "findByIdForTenant",
    });
    try {
      const res = await client.query<ContactDbRow>(
        `SELECT contact_id, tenant_id, name, email_normalized, phone_e164, created_at, updated_at
         FROM contacts WHERE contact_id = $1 AND tenant_id = $2`,
        [contactId, tenantId],
      );
      const row = res.rows[0];
      if (!row) return null;
      return mapRow(row);
    } finally {
      end();
    }
  }

  /**
   * Upsert with tenant-scoped dedupe on email and phone.
   * Uses SELECT FOR UPDATE on candidate rows, then INSERT/UPDATE with unique-violation retry.
   */
  async upsertContact(
    client: pg.PoolClient,
    args: {
      tenantId: string;
      name: string;
      emailNormalized: string | null;
      phoneE164: string | null;
    },
  ): Promise<{ row: ContactRow; outcome: ContactUpsertOutcome }> {
    const end = this.metrics.dbLatencySeconds.startTimer({
      operation: "upsertContact",
    });
    try {
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          return await this.upsertOnce(client, args);
        } catch (e: unknown) {
          const err = e as { code?: string };
          if (err.code === "23505" && attempt < 4) continue;
          throw e;
        }
      }
      throw new Error("upsertContact: exhausted retries");
    } finally {
      end();
    }
  }

  private async upsertOnce(
    client: pg.PoolClient,
    args: {
      tenantId: string;
      name: string;
      emailNormalized: string | null;
      phoneE164: string | null;
    },
  ): Promise<{ row: ContactRow; outcome: ContactUpsertOutcome }> {
    const { tenantId, name, emailNormalized, phoneE164 } = args;

    const lockSeeds: string[] = [];
    if (emailNormalized)
      lockSeeds.push(`${tenantId}|email|${emailNormalized}`);
    if (phoneE164) lockSeeds.push(`${tenantId}|phone|${phoneE164}`);
    lockSeeds.sort();
    for (const seed of lockSeeds) {
      await client.query(
        `SELECT pg_advisory_xact_lock(
          ('x' || substr(md5($1::text), 1, 16))::bit(64)::bigint
        )`,
        [seed],
      );
    }

    const existing = await client.query<{
      contact_id: string;
      tenant_id: string;
      name: string;
      email_normalized: string | null;
      phone_e164: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT contact_id, tenant_id, name, email_normalized, phone_e164, created_at, updated_at
       FROM contacts
       WHERE tenant_id = $1
         AND (
           ($2::text IS NOT NULL AND email_normalized = $2)
           OR ($3::text IS NOT NULL AND phone_e164 = $3)
         )
       FOR UPDATE`,
      [tenantId, emailNormalized, phoneE164],
    );

    if (existing.rowCount! > 1) {
      throw new ConflictError(
        "Multiple existing contacts match this payload; cannot merge safely.",
        "DEDUPE_AMBIGUOUS",
        { tenantId },
      );
    }

    if (existing.rowCount === 1) {
      const cur = existing.rows[0];
      const sameName = cur.name === name;
      const sameEmail = (cur.email_normalized ?? null) === emailNormalized;
      const samePhone = (cur.phone_e164 ?? null) === phoneE164;
      if (sameName && sameEmail && samePhone) {
        this.metrics.contactsDuplicates.inc({ tenant_id: tenantId });
        return { row: mapRow(cur), outcome: "deduplicated" };
      }

      const res = await client.query<typeof cur>(
        `UPDATE contacts
         SET name = $2,
             email_normalized = COALESCE($3, email_normalized),
             phone_e164 = COALESCE($4, phone_e164),
             updated_at = now()
         WHERE contact_id = $1
         RETURNING contact_id, tenant_id, name, email_normalized, phone_e164, created_at, updated_at`,
        [cur.contact_id, name, emailNormalized, phoneE164],
      );
      this.metrics.contactsUpdated.inc({ tenant_id: tenantId });
      return { row: mapRow(res.rows[0]), outcome: "updated" };
    }

    const ins = await client.query<{
      contact_id: string;
      tenant_id: string;
      name: string;
      email_normalized: string | null;
      phone_e164: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `INSERT INTO contacts (tenant_id, name, email_normalized, phone_e164)
       VALUES ($1, $2, $3, $4)
       RETURNING contact_id, tenant_id, name, email_normalized, phone_e164, created_at, updated_at`,
      [tenantId, name, emailNormalized, phoneE164],
    );
    this.metrics.contactsCreated.inc({ tenant_id: tenantId });
    return { row: mapRow(ins.rows[0]), outcome: "created" };
  }
}
