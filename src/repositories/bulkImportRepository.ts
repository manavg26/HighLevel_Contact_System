import type pg from "pg";

export type BulkImportRow = {
  importId: string;
  tenantId: string;
  importIdempotencyKey: string;
  status: string;
};

export class BulkImportRepository {
  async findByTenantKey(
    client: pg.PoolClient,
    tenantId: string,
    importIdempotencyKey: string,
  ): Promise<BulkImportRow | null> {
    const res = await client.query<{
      import_id: string;
      tenant_id: string;
      import_idempotency_key: string;
      status: string;
    }>(
      `SELECT import_id, tenant_id, import_idempotency_key, status
       FROM bulk_imports
       WHERE tenant_id = $1 AND import_idempotency_key = $2`,
      [tenantId, importIdempotencyKey],
    );
    if (res.rowCount === 0) return null;
    const r = res.rows[0];
    return {
      importId: r.import_id,
      tenantId: r.tenant_id,
      importIdempotencyKey: r.import_idempotency_key,
      status: r.status,
    };
  }

  async lockOrCreateImport(
    client: pg.PoolClient,
    tenantId: string,
    importIdempotencyKey: string,
  ): Promise<{ importId: string; status: string }> {
    const res = await client.query<{ import_id: string; status: string }>(
      `INSERT INTO bulk_imports (tenant_id, import_idempotency_key, status)
       VALUES ($1, $2, 'accepted')
       ON CONFLICT (tenant_id, import_idempotency_key) DO NOTHING
       RETURNING import_id, status`,
      [tenantId, importIdempotencyKey],
    );
    if (res.rowCount === 1) {
      const row = res.rows[0];
      return { importId: row.import_id, status: row.status };
    }
    const locked = await client.query<{ import_id: string; status: string }>(
      `SELECT import_id, status
       FROM bulk_imports
       WHERE tenant_id = $1 AND import_idempotency_key = $2
       FOR UPDATE`,
      [tenantId, importIdempotencyKey],
    );
    if (locked.rowCount === 0) {
      throw new Error("bulk import row missing after conflict");
    }
    const row = locked.rows[0];
    return { importId: row.import_id, status: row.status };
  }

  async markProcessing(client: pg.PoolClient, importId: string): Promise<void> {
    await client.query(
      `UPDATE bulk_imports SET status = 'processing', updated_at = now() WHERE import_id = $1`,
      [importId],
    );
  }

  async incrementProgress(
    client: pg.PoolClient,
    importId: string,
    delta: {
      batchesProcessed: number;
      contactsUpserted: number;
      contactsCreated: number;
      contactsUpdated: number;
      duplicatesDetected: number;
      validationFailed: number;
    },
  ): Promise<void> {
    await client.query(
      `UPDATE bulk_imports SET
        batches_processed = batches_processed + $2,
        contacts_upserted = contacts_upserted + $3,
        contacts_created = contacts_created + $4,
        contacts_updated = contacts_updated + $5,
        duplicates_detected = duplicates_detected + $6,
        validation_failed = validation_failed + $7,
        updated_at = now()
       WHERE import_id = $1`,
      [
        importId,
        delta.batchesProcessed,
        delta.contactsUpserted,
        delta.contactsCreated,
        delta.contactsUpdated,
        delta.duplicatesDetected,
        delta.validationFailed,
      ],
    );
  }

  async resetForRetry(client: pg.PoolClient, importId: string): Promise<void> {
    await client.query(
      `UPDATE bulk_imports SET
        status = 'accepted',
        batches_processed = 0,
        contacts_upserted = 0,
        contacts_created = 0,
        contacts_updated = 0,
        duplicates_detected = 0,
        validation_failed = 0,
        total_lines = NULL,
        batches_total = NULL,
        last_error_code = NULL,
        last_error_message = NULL,
        updated_at = now()
       WHERE import_id = $1`,
      [importId],
    );
  }

  async finalize(
    client: pg.PoolClient,
    importId: string,
    status: "completed" | "completed_with_errors" | "failed",
    totals?: { totalLines: bigint; batchesTotal: number; validationFailed?: number },
    lastError?: { code: string; message: string },
  ): Promise<void> {
    await client.query(
      `UPDATE bulk_imports SET
        status = $2,
        total_lines = COALESCE($3, total_lines),
        batches_total = COALESCE($4::int, batches_total),
        validation_failed = COALESCE($7::int, validation_failed),
        last_error_code = COALESCE($5, last_error_code),
        last_error_message = COALESCE($6, last_error_message),
        updated_at = now()
       WHERE import_id = $1`,
      [
        importId,
        status,
        totals?.totalLines ?? null,
        totals?.batchesTotal ?? null,
        lastError?.code ?? null,
        lastError?.message ?? null,
        totals?.validationFailed ?? null,
      ],
    );
  }

  async getSummary(client: pg.PoolClient, importId: string) {
    const res = await client.query<{
      import_id: string;
      tenant_id: string;
      status: string;
      total_lines: string | null;
      batches_total: number | null;
      batches_processed: number;
      contacts_upserted: number;
      contacts_created: number;
      contacts_updated: number;
      duplicates_detected: number;
      validation_failed: number;
      last_error_code: string | null;
      last_error_message: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT import_id, tenant_id, status, total_lines, batches_total, batches_processed,
              contacts_upserted, contacts_created, contacts_updated, duplicates_detected,
              validation_failed, last_error_code, last_error_message, created_at, updated_at
       FROM bulk_imports WHERE import_id = $1`,
      [importId],
    );
    if (res.rowCount === 0) return null;
    return res.rows[0];
  }
}
