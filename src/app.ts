import Fastify from "fastify";
import { randomUUID } from "node:crypto";
import type { FastifyRequest } from "fastify";
import type { IncomingMessage } from "node:http";
import { registerRoutes } from "./api/registerRoutes.js";
import { mapUnknownError } from "./api/errorMapper.js";
import type { AppDependencies } from "./compositionRoot.js";
import { ValidationError } from "./domain/errors.js";
import { ZodError } from "zod";

export async function buildApp(deps: AppDependencies) {
  const app = Fastify({
    logger: deps.log,
    genReqId: () => randomUUID(),
    requestIdHeader: "x-request-id",
    disableRequestLogging: false,
  });

  app.addContentTypeParser(
    "application/x-ndjson",
    { bodyLimit: 1024 * 1024 * 1024 },
    (
      _req: FastifyRequest,
      payload: IncomingMessage,
      done: (err: Error | null, body?: unknown) => void,
    ) => {
      done(null, payload);
    },
  );

  app.addHook("onRequest", (req) => {
    (req as { _startedAt?: bigint })._startedAt = process.hrtime.bigint();
  });

  app.addHook("onResponse", (req, reply) => {
    const started = (req as { _startedAt?: bigint })._startedAt;
    const seconds = started
      ? Number(process.hrtime.bigint() - started) / 1e9
      : 0;
    const route = req.routeOptions?.url ?? req.url;
    deps.metrics.apiLatencySeconds.observe(
      {
        method: req.method,
        route,
        status_code: String(reply.statusCode),
      },
      seconds,
    );
  });

  app.setErrorHandler((err, req, reply) => {
    const mapped =
      err instanceof ZodError
        ? new ValidationError("Request validation failed.", {
            issues: err.flatten(),
          })
        : mapUnknownError(err);

    if (mapped.httpStatus >= 500) {
      req.log.error(
        { err: mapped, requestId: req.id, internal: mapped.internalContext },
        "server_error",
      );
    } else {
      req.log.warn(
        {
          requestId: req.id,
          code: mapped.code,
          tenantId: (req.params as { tenantId?: string } | undefined)?.tenantId,
        },
        "client_error",
      );
    }

    const body: {
      error: {
        code: string;
        message: string;
        requestId: string;
        details?: Record<string, unknown>;
      };
    } = {
      error: {
        code: mapped.code,
        message: mapped.message,
        requestId: req.id,
      },
    };
    if (mapped instanceof ValidationError) {
      body.error.details = mapped.details;
    }
    return reply.code(mapped.httpStatus).send(body);
  });

  registerRoutes(app, deps);
  return app;
}
