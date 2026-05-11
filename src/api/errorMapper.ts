import type { FastifyError } from "fastify";
import { AppError, ServiceUnavailableError } from "../domain/errors.js";

export function mapUnknownError(err: unknown): AppError {
  if (err instanceof AppError) return err;
  const fe = err as FastifyError & { code?: string };
  if (fe.code === "23505") {
    return new AppError({
      code: "UNIQUE_VIOLATION",
      message: "A database uniqueness constraint was violated.",
      httpStatus: 409,
      internalContext: { pgCode: fe.code },
    });
  }
  if (fe.code === "ECONNREFUSED" || fe.code === "57P01") {
    return new ServiceUnavailableError("Database is temporarily unavailable.", {
      pgCode: fe.code,
    });
  }
  return new AppError({
    code: "INTERNAL",
    message: "An unexpected error occurred.",
    httpStatus: 500,
    internalContext: { causeName: fe.name },
    cause: err,
  });
}
