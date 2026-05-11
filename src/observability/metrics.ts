import {
  Counter,
  Histogram,
  Registry,
  collectDefaultMetrics,
} from "prom-client";

export function createMetricsRegistry() {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });

  const contactsCreated = new Counter({
    name: "contacts_created_total",
    help: "Contacts created (new rows)",
    labelNames: ["tenant_id"],
    registers: [registry],
  });

  const contactsUpdated = new Counter({
    name: "contacts_updated_total",
    help: "Contacts updated via upsert",
    labelNames: ["tenant_id"],
    registers: [registry],
  });

  const contactsDuplicates = new Counter({
    name: "contacts_duplicates_total",
    help: "Dedupe hits (matched existing row)",
    labelNames: ["tenant_id"],
    registers: [registry],
  });

  const contactsValidationFailed = new Counter({
    name: "contacts_validation_failed_total",
    help: "Validation failures",
    labelNames: ["tenant_id", "reason"],
    registers: [registry],
  });

  const bulkImportSuccess = new Counter({
    name: "contacts_bulk_import_success_total",
    help: "Bulk imports completed successfully",
    labelNames: ["tenant_id"],
    registers: [registry],
  });

  const bulkImportFailed = new Counter({
    name: "contacts_bulk_import_failed_total",
    help: "Bulk imports failed",
    labelNames: ["tenant_id", "reason"],
    registers: [registry],
  });

  const dbLatencySeconds = new Histogram({
    name: "db_query_duration_seconds",
    help: "Database operation latency",
    labelNames: ["operation"],
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    registers: [registry],
  });

  const queueLatencySeconds = new Histogram({
    name: "write_queue_wait_seconds",
    help: "Time spent waiting in tenant write queue",
    labelNames: ["partition"],
    buckets: [0.0001, 0.0005, 0.001, 0.005, 0.01, 0.05, 0.1, 0.5],
    registers: [registry],
  });

  const apiLatencySeconds = new Histogram({
    name: "http_request_duration_seconds",
    help: "HTTP request latency",
    labelNames: ["method", "route", "status_code"],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5],
    registers: [registry],
  });

  return {
    registry,
    contactsCreated,
    contactsUpdated,
    contactsDuplicates,
    contactsValidationFailed,
    bulkImportSuccess,
    bulkImportFailed,
    dbLatencySeconds,
    queueLatencySeconds,
    apiLatencySeconds,
  };
}

export type AppMetrics = ReturnType<typeof createMetricsRegistry>;
