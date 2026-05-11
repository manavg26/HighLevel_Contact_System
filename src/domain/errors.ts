export type ErrorBody = {
  error: {
    code: string;
    message: string;
    requestId?: string;
    details?: Record<string, unknown>;
  };
};

export class AppError extends Error {
  readonly code: string;
  readonly httpStatus: number;
  readonly internalContext: Record<string, unknown>;
  readonly isRetryable: boolean;

  constructor(opts: {
    code: string;
    message: string;
    httpStatus: number;
    internalContext?: Record<string, unknown>;
    isRetryable?: boolean;
    cause?: unknown;
  }) {
    super(opts.message, { cause: opts.cause });
    this.name = "AppError";
    this.code = opts.code;
    this.httpStatus = opts.httpStatus;
    this.internalContext = opts.internalContext ?? {};
    this.isRetryable = opts.isRetryable ?? false;
  }

  toJSON(): ErrorBody["error"] {
    return {
      code: this.code,
      message: this.message,
      details: undefined,
    };
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    public readonly details: Record<string, unknown>,
    internalContext?: Record<string, unknown>,
  ) {
    super({
      code: "VALIDATION_ERROR",
      message,
      httpStatus: 400,
      internalContext,
    });
    this.name = "ValidationError";
  }

  override toJSON() {
    return { ...super.toJSON(), details: this.details };
  }
}

export class ConflictError extends AppError {
  constructor(
    message: string,
    code = "CONFLICT",
    internalContext?: Record<string, unknown>,
    httpStatus = 409,
  ) {
    super({ code, message, httpStatus, internalContext });
    this.name = "ConflictError";
  }
}

export class IdempotencyConflictError extends AppError {
  constructor(internalContext?: Record<string, unknown>) {
    super({
      code: "IDEMPOTENCY_KEY_REUSE",
      message:
        "The same idempotency key was reused with a different payload.",
      httpStatus: 409,
      internalContext,
    });
    this.name = "IdempotencyConflictError";
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string, internalContext?: Record<string, unknown>) {
    super({
      code: "NOT_FOUND",
      message: `${resource} was not found.`,
      httpStatus: 404,
      internalContext,
    });
    this.name = "NotFoundError";
  }
}

export class ServiceUnavailableError extends AppError {
  constructor(message: string, internalContext?: Record<string, unknown>) {
    super({
      code: "SERVICE_UNAVAILABLE",
      message,
      httpStatus: 503,
      internalContext,
      isRetryable: true,
    });
    this.name = "ServiceUnavailableError";
  }
}
