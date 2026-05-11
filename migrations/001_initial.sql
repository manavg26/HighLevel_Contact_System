-- Contact ingestion schema: partial unique indexes for tenant-scoped email/phone,
-- idempotency ledger, bulk import tracking.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS contacts (
  contact_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  email_normalized TEXT,
  phone_e164 TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT chk_contact_email_or_phone CHECK (
    email_normalized IS NOT NULL OR phone_e164 IS NOT NULL
  )
);

COMMENT ON TABLE contacts IS 'Tenant-scoped contacts; dedupe keys are normalized email and E.164 phone.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_tenant_email_unique
  ON contacts (tenant_id, email_normalized)
  WHERE email_normalized IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_tenant_phone_unique
  ON contacts (tenant_id, phone_e164)
  WHERE phone_e164 IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_tenant_lookup ON contacts (tenant_id);

CREATE TABLE IF NOT EXISTS idempotency_records (
  tenant_id TEXT NOT NULL,
  scope TEXT NOT NULL,
  idempotency_key TEXT NOT NULL,
  resource_type TEXT NOT NULL,
  resource_id UUID,
  request_fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'failed')),
  error_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  PRIMARY KEY (tenant_id, scope, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_idempotency_resource ON idempotency_records (tenant_id, resource_type, resource_id)
  WHERE resource_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS bulk_imports (
  import_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  import_idempotency_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'accepted' CHECK (
    status IN ('accepted', 'processing', 'completed', 'completed_with_errors', 'failed')
  ),
  total_lines BIGINT,
  batches_total INT,
  batches_processed INT NOT NULL DEFAULT 0,
  contacts_upserted INT NOT NULL DEFAULT 0,
  contacts_created INT NOT NULL DEFAULT 0,
  contacts_updated INT NOT NULL DEFAULT 0,
  duplicates_detected INT NOT NULL DEFAULT 0,
  validation_failed INT NOT NULL DEFAULT 0,
  last_error_code TEXT,
  last_error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, import_idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_bulk_imports_tenant ON bulk_imports (tenant_id, created_at DESC);
