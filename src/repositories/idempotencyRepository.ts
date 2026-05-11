import type pg from "pg";
import { IdempotencyConflictError } from "../domain/errors.js";

export const CONTACT_CREATE_SCOPE = "contact_create";
export const BULK_IMPORT_SCOPE = "bulk_import";

export type IdempotencyRow = {
  resourceId: string | null;
  requestFingerprint: string;
  status: "in_progress" | "completed" | "failed";
};

export class IdempotencyRepository {
  async findForUpdate(
    client: pg.PoolClient,
    tenantId: string,
    scope: string,
    idempotencyKey: string,
  ): Promise<IdempotencyRow | null> {
    const res = await client.query<{
      resource_id: string | null;
      request_fingerprint: string;
      status: IdempotencyRow["status"];
    }>(
      `SELECT resource_id, request_fingerprint, status
       FROM idempotency_records
       WHERE tenant_id = $1 AND scope = $2 AND idempotency_key = $3
       FOR UPDATE`,
      [tenantId, scope, idempotencyKey],
    );
    if (res.rowCount === 0) return null;
    const row = res.rows[0];
    return {
      resourceId: row.resource_id,
      requestFingerprint: row.request_fingerprint,
      status: row.status,
    };
  }

  async insertInProgress(
    client: pg.PoolClient,
    args: {
      tenantId: string;
      scope: string;
      idempotencyKey: string;
      resourceType: string;
      fingerprint: string;
    },
  ): Promise<"inserted" | "conflict"> {
    try {
      await client.query(
        `INSERT INTO idempotency_records
          (tenant_id, scope, idempotency_key, resource_type, resource_id, request_fingerprint, status)
         VALUES ($1, $2, $3, $4, NULL, $5, 'in_progress')`,
        [
          args.tenantId,
          args.scope,
          args.idempotencyKey,
          args.resourceType,
          args.fingerprint,
        ],
      );
      return "inserted";
    } catch (e: unknown) {
      const err = e as { code?: string };
      if (err.code === "23505") return "conflict";
      throw e;
    }
  }

  assertFingerprintMatch(
    row: IdempotencyRow,
    fingerprint: string,
    internal: Record<string, unknown>,
  ): void {
    if (row.requestFingerprint !== fingerprint) {
      throw new IdempotencyConflictError(internal);
    }
  }

  async markCompleted(
    client: pg.PoolClient,
    tenantId: string,
    scope: string,
    idempotencyKey: string,
    resourceId: string,
  ): Promise<void> {
    await client.query(
      `UPDATE idempotency_records
       SET status = 'completed',
           resource_id = $4,
           completed_at = now()
       WHERE tenant_id = $1 AND scope = $2 AND idempotency_key = $3`,
      [tenantId, scope, idempotencyKey, resourceId],
    );
  }

  async markFailed(
    client: pg.PoolClient,
    tenantId: string,
    scope: string,
    idempotencyKey: string,
    errorCode: string,
  ): Promise<void> {
    await client.query(
      `UPDATE idempotency_records
       SET status = 'failed',
           error_code = $4,
           completed_at = now()
       WHERE tenant_id = $1 AND scope = $2 AND idempotency_key = $3`,
      [tenantId, scope, idempotencyKey, errorCode],
    );
  }
}
