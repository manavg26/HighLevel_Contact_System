import type { Pool, PoolClient } from "pg";
import type { Env } from "../config/env.js";
import type { ContactWriteDto } from "../dto/contact.dto.js";
import { AppError, NotFoundError, ValidationError } from "../domain/errors.js";
import { normalizeEmail } from "../lib/email.js";
import { stableFingerprint } from "../lib/fingerprint.js";
import { maskEmail, maskPhone } from "../lib/pii.js";
import { normalizePhone } from "../lib/phone.js";
import type { AppLogger } from "../observability/logger.js";
import type { AppMetrics } from "../observability/metrics.js";
import { type TenantWriteQueue } from "../queue/tenantWriteQueue.js";
import { type ContactRepository } from "../repositories/contactRepository.js";
import {
  CONTACT_CREATE_SCOPE,
  type IdempotencyRepository,
} from "../repositories/idempotencyRepository.js";

export type CreateContactContext = {
  requestId: string;
  idempotencyKey?: string;
};

export type ContactServiceResult = {
  contactId: string;
  tenantId: string;
  name: string;
  email: string | null;
  phoneNumber: string | null;
  outcome: "created" | "updated" | "deduplicated" | "replay";
  createdAt: string;
  updatedAt: string;
};

export class ContactService {
  constructor(
    private readonly pool: Pool,
    private readonly env: Env,
    private readonly log: AppLogger,
    private readonly metrics: AppMetrics,
    private readonly contacts: ContactRepository,
    private readonly idempotency: IdempotencyRepository,
    private readonly queue: TenantWriteQueue,
  ) {}

  async getContact(
    tenantId: string,
    contactId: string,
    ctx: { requestId: string },
  ): Promise<ContactServiceResult> {
    const client = await this.pool.connect();
    try {
      const row = await this.contacts.findByIdForTenant(
        client,
        tenantId,
        contactId,
      );
      if (!row) {
        throw new NotFoundError("Contact", { tenantId, contactId });
      }
      this.log.debug(
        { requestId: ctx.requestId, tenantId, contactId },
        "contact.read",
      );
      return this.toResponse(row, "deduplicated");
    } finally {
      client.release();
    }
  }

  async createContact(
    tenantId: string,
    dto: ContactWriteDto,
    ctx: CreateContactContext,
  ): Promise<ContactServiceResult> {
    const partitionKey = tenantId;
    return this.queue.run(partitionKey, "contact.create", async () => {
      const started = Date.now();
      const normalized = this.normalizePayload(tenantId, dto);
      const fingerprint = stableFingerprint({
        name: normalized.name,
        email: normalized.emailNormalized,
        phone: normalized.phoneE164,
      });

      this.log.info(
        {
          requestId: ctx.requestId,
          tenantId,
          idempotencyKey: ctx.idempotencyKey,
          op: "contact.create",
          emailMasked: normalized.emailNormalized
            ? maskEmail(normalized.emailNormalized)
            : undefined,
          phoneMasked: normalized.phoneE164
            ? maskPhone(normalized.phoneE164)
            : undefined,
        },
        "request.received",
      );

      const client = await this.pool.connect();
      try {
        await client.query("BEGIN");
        if (ctx.idempotencyKey) {
          const replay = await this.tryIdempotentReplay(
            client,
            tenantId,
            ctx.idempotencyKey,
            fingerprint,
            ctx.requestId,
          );
          if (replay) {
            await client.query("COMMIT");
            this.log.info(
              {
                requestId: ctx.requestId,
                tenantId,
                contactId: replay.contactId,
                idempotencyKey: ctx.idempotencyKey,
                latencyMs: Date.now() - started,
                op: "contact.create",
              },
              "retry.idempotent_replay",
            );
            return replay;
          }
        }

        const { row, outcome } = await this.contacts.upsertContact(client, {
          tenantId,
          name: normalized.name,
          emailNormalized: normalized.emailNormalized,
          phoneE164: normalized.phoneE164,
        });

        if (ctx.idempotencyKey) {
          await this.idempotency.markCompleted(
            client,
            tenantId,
            CONTACT_CREATE_SCOPE,
            ctx.idempotencyKey,
            row.contactId,
          );
        }

        await client.query("COMMIT");

        this.log.info(
          {
            requestId: ctx.requestId,
            tenantId,
            contactId: row.contactId,
            idempotencyKey: ctx.idempotencyKey,
            outcome,
            latencyMs: Date.now() - started,
            op: "contact.create",
          },
          "db.write.completed",
        );

        return this.toResponse(row, outcome);
      } catch (e) {
        await client.query("ROLLBACK");
        throw e;
      } finally {
        client.release();
      }
    });
  }

  private normalizePayload(tenantId: string, dto: ContactWriteDto) {
    const emailNormalized = dto.email ? normalizeEmail(dto.email) : null;
    let phoneE164: string | null = null;
    if (dto.phoneNumber) {
      const pn = normalizePhone(dto.phoneNumber, this.env.PHONE_DEFAULT_REGION);
      if (!pn.ok) {
        this.metrics.contactsValidationFailed.inc({
          tenant_id: tenantId,
          reason: pn.reason,
        });
        throw new ValidationError("Invalid phone number.", { phoneNumber: pn.reason });
      }
      phoneE164 = pn.e164;
    }
    if (!emailNormalized && !phoneE164) {
      this.metrics.contactsValidationFailed.inc({
        tenant_id: tenantId,
        reason: "MISSING_EMAIL_AND_PHONE",
      });
      throw new ValidationError("Either email or phoneNumber is required.", {
        email: "missing",
        phoneNumber: "missing",
      });
    }
    return { name: dto.name, emailNormalized, phoneE164 };
  }

  private toResponse(
    row: {
      contactId: string;
      tenantId: string;
      name: string;
      emailNormalized: string | null;
      phoneE164: string | null;
      createdAt: Date;
      updatedAt: Date;
    },
    outcome: ContactServiceResult["outcome"],
  ): ContactServiceResult {
    return {
      contactId: row.contactId,
      tenantId: row.tenantId,
      name: row.name,
      email: row.emailNormalized,
      phoneNumber: row.phoneE164,
      outcome,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private async tryIdempotentReplay(
    client: PoolClient,
    tenantId: string,
    idempotencyKey: string,
    fingerprint: string,
    requestId: string,
  ): Promise<ContactServiceResult | null> {
    const inserted = await this.idempotency.insertInProgress(client, {
      tenantId,
      scope: CONTACT_CREATE_SCOPE,
      idempotencyKey,
      resourceType: "contact",
      fingerprint,
    });

    if (inserted === "inserted") {
      return null;
    }

    const row = await this.idempotency.findForUpdate(
      client,
      tenantId,
      CONTACT_CREATE_SCOPE,
      idempotencyKey,
    );
    if (!row) return null;

    if (row.status === "completed" && row.resourceId) {
      this.idempotency.assertFingerprintMatch(row, fingerprint, {
        tenantId,
        idempotencyKey,
        requestId,
      });
      const contact = await this.contacts.findById(client, row.resourceId);
      if (!contact) {
        throw new AppError({
          code: "IDEMPOTENCY_ORPHAN",
          message: "Idempotent replay failed: contact missing.",
          httpStatus: 500,
          internalContext: { tenantId, idempotencyKey },
        });
      }
      return this.toResponse(contact, "replay");
    }

    if (row.status === "failed") {
      if (row.requestFingerprint !== fingerprint) {
        throw new AppError({
          code: "IDEMPOTENCY_KEY_REUSE",
          message:
            "The same idempotency key was reused after a failed attempt with a different payload.",
          httpStatus: 409,
          internalContext: { tenantId, idempotencyKey, requestId },
        });
      }
      await client.query(
        `UPDATE idempotency_records
         SET status = 'in_progress',
             resource_id = NULL,
             completed_at = NULL,
             error_code = NULL
         WHERE tenant_id = $1 AND scope = $2 AND idempotency_key = $3`,
        [tenantId, CONTACT_CREATE_SCOPE, idempotencyKey],
      );
      return null;
    }

    this.idempotency.assertFingerprintMatch(row, fingerprint, {
      tenantId,
      idempotencyKey,
      requestId,
    });

    throw new AppError({
      code: "IDEMPOTENCY_IN_FLIGHT",
      message:
        "A request with this idempotency key is still being processed. Retry with backoff.",
      httpStatus: 409,
      isRetryable: true,
      internalContext: { tenantId, idempotencyKey, requestId },
    });
  }
}
