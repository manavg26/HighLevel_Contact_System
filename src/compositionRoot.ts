import { loadEnv, type Env } from "./config/env.js";
import { createPool, type DbPool } from "./db/pool.js";
import { createLogger, type AppLogger } from "./observability/logger.js";
import { createMetricsRegistry, type AppMetrics } from "./observability/metrics.js";
import { TenantWriteQueue } from "./queue/tenantWriteQueue.js";
import { BulkImportRepository } from "./repositories/bulkImportRepository.js";
import { ContactRepository } from "./repositories/contactRepository.js";
import { IdempotencyRepository } from "./repositories/idempotencyRepository.js";
import { BulkImportService } from "./services/bulkImportService.js";
import { ContactService } from "./services/contactService.js";

export type AppDependencies = {
  env: Env;
  pool: DbPool;
  log: AppLogger;
  metrics: AppMetrics;
  contactService: ContactService;
  bulkImportService: BulkImportService;
};

export function createDependencies(
  overrides?: Partial<Record<string, string | undefined>>,
): AppDependencies {
  const env = loadEnv(overrides);
  const pool = createPool(env);
  const log = createLogger(env);
  const metrics = createMetricsRegistry();
  const queue = new TenantWriteQueue(log, metrics);
  const contacts = new ContactRepository(metrics);
  const idempotency = new IdempotencyRepository();
  const bulkImports = new BulkImportRepository();
  const contactService = new ContactService(
    pool,
    env,
    log,
    metrics,
    contacts,
    idempotency,
    queue,
  );
  const bulkImportService = new BulkImportService(
    pool,
    env,
    log,
    metrics,
    contacts,
    bulkImports,
    queue,
  );
  return { env, pool, log, metrics, contactService, bulkImportService };
}
