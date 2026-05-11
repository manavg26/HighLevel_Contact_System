import type { FastifyInstance } from "fastify";
import type { Readable } from "node:stream";
import { ZodError } from "zod";
import { contactWriteSchema } from "../dto/contact.dto.js";
import { ValidationError } from "../domain/errors.js";
import type { AppDependencies } from "../compositionRoot.js";

export function registerRoutes(
  app: FastifyInstance,
  deps: AppDependencies,
): void {
  app.get("/healthz", () => ({ ok: true }));

  app.get("/metrics", async (_req, reply) => {
    reply.header("content-type", deps.metrics.registry.contentType);
    return reply.send(await deps.metrics.registry.metrics());
  });

  app.post<{
    Params: { tenantId: string };
    Body: unknown;
  }>("/v1/tenants/:tenantId/contacts", async (req, reply) => {
    const idempotencyKey = req.headers["idempotency-key"];
    const key =
      typeof idempotencyKey === "string" && idempotencyKey.length > 0
        ? idempotencyKey
        : undefined;
    let dto;
    try {
      dto = contactWriteSchema.parse(req.body);
    } catch (e) {
      if (e instanceof ZodError) {
        throw new ValidationError("Invalid contact payload.", { issues: e.flatten() });
      }
      throw e;
    }
    const result = await deps.contactService.createContact(
      req.params.tenantId,
      dto,
      { requestId: req.id, idempotencyKey: key },
    );
    const status = result.outcome === "replay" ? 200 : 201;
    return reply.code(status).send(result);
  });

  app.get<{
    Params: { tenantId: string; contactId: string };
  }>("/v1/tenants/:tenantId/contacts/:contactId", async (req, reply) => {
    const result = await deps.contactService.getContact(
      req.params.tenantId,
      req.params.contactId,
      { requestId: req.id },
    );
    return reply.send(result);
  });

  app.post<{
    Params: { tenantId: string };
  }>("/v1/tenants/:tenantId/contacts/bulk", async (req, reply) => {
    const importKey = req.headers["import-idempotency-key"];
    if (typeof importKey !== "string" || importKey.length === 0) {
      throw new ValidationError("Import-Idempotency-Key header is required.", {
        header: "Import-Idempotency-Key",
      });
    }
    const contentType = String(req.headers["content-type"] ?? "");
    if (!contentType.toLowerCase().includes("application/x-ndjson")) {
      throw new ValidationError("Content-Type must be application/x-ndjson.", {
        contentType,
      });
    }
    const bodyStream = req.body as Readable;
    const summary = await deps.bulkImportService.importNdjsonStream({
      tenantId: req.params.tenantId,
      importIdempotencyKey: importKey,
      body: bodyStream,
      ctx: { requestId: req.id },
    });
    return reply.code(200).send(summary);
  });

  app.get<{
    Params: { tenantId: string; importId: string };
  }>("/v1/tenants/:tenantId/imports/:importId", async (req, reply) => {
    const summary = await deps.bulkImportService.getImport(
      req.params.tenantId,
      req.params.importId,
      { requestId: req.id },
    );
    return reply.send(summary);
  });
}
