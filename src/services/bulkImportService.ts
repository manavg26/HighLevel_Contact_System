import { createInterface } from "node:readline";
import type { Readable } from "node:stream";
import type { Pool } from "pg";
import { ZodError } from "zod";
import type { Env } from "../config/env.js";
import { contactWriteSchema } from "../dto/contact.dto.js";
import { AppError, ConflictError } from "../domain/errors.js";
import { normalizeEmail } from "../lib/email.js";
import { normalizePhone } from "../lib/phone.js";
import type { AppLogger } from "../observability/logger.js";
import type { AppMetrics } from "../observability/metrics.js";
import { type TenantWriteQueue } from "../queue/tenantWriteQueue.js";
import { type BulkImportRepository } from "../repositories/bulkImportRepository.js";
import { type ContactRepository } from "../repositories/contactRepository.js";

const BATCH_SIZE = 500;

export type BulkImportSummary = {
  importId: string;
  tenantId: string;
  status: string;
  totalLines: string | null;
  batchesTotal: number | null;
  batchesProcessed: number;
  contactsUpserted: number;
  contactsCreated: number;
  contactsUpdated: number;
  duplicatesDetected: number;
  validationFailed: number;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  createdAt: string;
  updatedAt: string;
};

export class BulkImportService {
  constructor(
    private readonly pool: Pool,
    private readonly env: Env,
    private readonly log: AppLogger,
    private readonly metrics: AppMetrics,
    private readonly contacts: ContactRepository,
    private readonly imports: BulkImportRepository,
    private readonly queue: TenantWriteQueue,
  ) {}

  async getImport(
    tenantId: string,
    importId: string,
    ctx: { requestId: string },
  ): Promise<BulkImportSummary> {
    const client = await this.pool.connect();
    try {
      const row = await this.imports.getSummary(client, importId);
      if (!row || row.tenant_id !== tenantId) {
        throw new AppError({
          code: "IMPORT_NOT_FOUND",
          message: "Bulk import not found for tenant.",
          httpStatus: 404,
          internalContext: { tenantId, importId, requestId: ctx.requestId },
        });
      }
      return this.mapSummary(row);
    } finally {
      client.release();
    }
  }

  async importNdjsonStream(args: {
    tenantId: string;
    importIdempotencyKey: string;
    body: Readable;
    ctx: { requestId: string };
  }): Promise<BulkImportSummary> {
    const { tenantId, importIdempotencyKey, body, ctx } = args;
    const started = Date.now();

    const openClient = await this.pool.connect();
    let importId: string;
    let initialStatus: string;
    try {
      await openClient.query("BEGIN");
      const locked = await this.imports.lockOrCreateImport(
        openClient,
        tenantId,
        importIdempotencyKey,
      );
      importId = locked.importId;
      initialStatus = locked.status;

      if (
        initialStatus === "completed" ||
        initialStatus === "completed_with_errors"
      ) {
        await openClient.query("COMMIT");
        const summaryClient = await this.pool.connect();
        try {
          const row = await this.imports.getSummary(summaryClient, importId);
          if (!row) throw new Error("import row missing");
          this.log.info(
            {
              requestId: ctx.requestId,
              tenantId,
              importId,
              idempotencyKey: importIdempotencyKey,
              op: "bulk.import",
              latencyMs: Date.now() - started,
            },
            "bulk.import.idempotent_replay",
          );
          return this.mapSummary(row);
        } finally {
          summaryClient.release();
        }
      }

      if (initialStatus === "processing") {
        await openClient.query("ROLLBACK");
        throw new ConflictError(
          "This bulk import is already being processed.",
          "IMPORT_IN_PROGRESS",
          { tenantId, importId, requestId: ctx.requestId },
        );
      }

      if (initialStatus === "failed") {
        await this.imports.resetForRetry(openClient, importId);
      }

      await this.imports.markProcessing(openClient, importId);
      await openClient.query("COMMIT");
    } catch (e) {
      await openClient.query("ROLLBACK");
      throw e;
    } finally {
      openClient.release();
    }

    let lines = 0;
    let batches = 0;
    let validationFailed = 0;

    const rl = createInterface({ input: body, crlfDelay: Infinity });
    let batch: {
      name: string;
      emailNormalized: string | null;
      phoneE164: string | null;
    }[] = [];

    const flushBatch = async () => {
      if (batch.length === 0) return;
      batches++;
      await this.queue.run(tenantId, "bulk.batch", async () => {
        const client = await this.pool.connect();
        try {
          await client.query("BEGIN");
          let bCreated = 0;
          let bUpdated = 0;
          let bDup = 0;
          for (const item of batch) {
            const { outcome } = await this.contacts.upsertContact(client, {
              tenantId,
              name: item.name,
              emailNormalized: item.emailNormalized,
              phoneE164: item.phoneE164,
            });
            if (outcome === "created") bCreated++;
            else if (outcome === "updated") bUpdated++;
            else bDup++;
          }
          await this.imports.incrementProgress(client, importId, {
            batchesProcessed: 1,
            contactsUpserted: batch.length,
            contactsCreated: bCreated,
            contactsUpdated: bUpdated,
            duplicatesDetected: bDup,
            validationFailed: 0,
          });
          await client.query("COMMIT");
          this.log.info(
            {
              requestId: ctx.requestId,
              tenantId,
              importId,
              op: "bulk.import",
              batchSize: batch.length,
              batchesProcessed: batches,
            },
            "bulk.import.batch_committed",
          );
        } catch (e) {
          await client.query("ROLLBACK");
          this.metrics.bulkImportFailed.inc({
            tenant_id: tenantId,
            reason: "BATCH_FAILED",
          });
          throw e;
        } finally {
          client.release();
        }
      });
      batch = [];
    };

    try {
      for await (const rawLine of rl) {
        const line = rawLine.trim();
        if (!line) continue;
        lines++;
        try {
          const parsedJson: unknown = JSON.parse(line);
          const dto = contactWriteSchema.parse(parsedJson);
          const emailNormalized = dto.email ? normalizeEmail(dto.email) : null;
          let phoneE164: string | null = null;
          if (dto.phoneNumber) {
            const pn = normalizePhone(
              dto.phoneNumber,
              this.env.PHONE_DEFAULT_REGION,
            );
            if (!pn.ok) {
              validationFailed++;
              this.metrics.contactsValidationFailed.inc({
                tenant_id: tenantId,
                reason: pn.reason,
              });
              continue;
            }
            phoneE164 = pn.e164;
          }
          if (!emailNormalized && !phoneE164) {
            validationFailed++;
            this.metrics.contactsValidationFailed.inc({
              tenant_id: tenantId,
              reason: "MISSING_EMAIL_AND_PHONE",
            });
            continue;
          }
          batch.push({ name: dto.name, emailNormalized, phoneE164 });
          if (batch.length >= BATCH_SIZE) await flushBatch();
        } catch (e) {
          validationFailed++;
          const reason =
            e instanceof ZodError
              ? "ZOD"
              : e instanceof SyntaxError
                ? "JSON"
                : "UNKNOWN";
          this.metrics.contactsValidationFailed.inc({
            tenant_id: tenantId,
            reason,
          });
        }
      }

      await flushBatch();

      const status: "completed" | "completed_with_errors" =
        validationFailed > 0 ? "completed_with_errors" : "completed";
      const fin = await this.pool.connect();
      try {
        await fin.query("BEGIN");
        await this.imports.finalize(fin, importId, status, {
          totalLines: BigInt(lines),
          batchesTotal: batches,
          validationFailed,
        });
        await fin.query("COMMIT");
      } catch (e) {
        await fin.query("ROLLBACK");
        throw e;
      } finally {
        fin.release();
      }

      this.metrics.bulkImportSuccess.inc({ tenant_id: tenantId });

      const summaryClient = await this.pool.connect();
      try {
        const row = await this.imports.getSummary(summaryClient, importId);
        if (!row) throw new Error("import row missing after finalize");
        this.log.info(
          {
            requestId: ctx.requestId,
            tenantId,
            importId,
            op: "bulk.import",
            lines,
            latencyMs: Date.now() - started,
          },
          "bulk.import.completed",
        );
        return this.mapSummary(row);
      } finally {
        summaryClient.release();
      }
    } catch (e) {
      const fin = await this.pool.connect();
      try {
        await fin.query("BEGIN");
        await this.imports.finalize(fin, importId, "failed", undefined, {
          code: e instanceof AppError ? e.code : "UNEXPECTED",
          message: "Bulk import failed.",
        });
        await fin.query("COMMIT");
      } catch {
        await fin.query("ROLLBACK");
      } finally {
        fin.release();
      }
      this.metrics.bulkImportFailed.inc({
        tenant_id: tenantId,
        reason: e instanceof AppError ? e.code : "UNEXPECTED",
      });
      throw e;
    }
  }

  private mapSummary(row: {
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
  }): BulkImportSummary {
    return {
      importId: row.import_id,
      tenantId: row.tenant_id,
      status: row.status,
      totalLines: row.total_lines,
      batchesTotal: row.batches_total,
      batchesProcessed: row.batches_processed,
      contactsUpserted: row.contacts_upserted,
      contactsCreated: row.contacts_created,
      contactsUpdated: row.contacts_updated,
      duplicatesDetected: row.duplicates_detected,
      validationFailed: row.validation_failed,
      lastErrorCode: row.last_error_code,
      lastErrorMessage: row.last_error_message,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at.toISOString(),
    };
  }
}
