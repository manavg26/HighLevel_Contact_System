# Contact Ingestion

Multi-tenant **contact ingestion API** built with Node.js, TypeScript, Fastify, and PostgreSQL. Supports single-contact writes with idempotency, deduplication (tenant-scoped email and phone), streaming **NDJSON** bulk import, structured logging, and Prometheus metrics.

Repository: [github.com/manavg26/HighLevel_Contact_System](https://github.com/manavg26/HighLevel_Contact_System)

## Requirements

- Node.js **20+**
- PostgreSQL **16** (or compatible)
- Docker (optional, for local Postgres)

## Quick start

1. **Start Postgres** (matches default `DATABASE_URL`):

   ```bash
   docker compose up -d
   ```

2. **Install and migrate**:

   ```bash
   npm install
   npm run build
   npm run migrate
   ```

3. **Run the API**:

   ```bash
   npm run dev
   ```

   The server listens on `PORT` (default **3000**).

## Environment variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NODE_ENV` | `development` \| `test` \| `production` | `development` |
| `PORT` | HTTP port | `3000` |
| `DATABASE_URL` | PostgreSQL connection string | `postgres://contacts:contacts@127.0.0.1:5432/contacts` |
| `PHONE_DEFAULT_REGION` | ISO region for parsing local numbers | `US` |
| `LOG_LEVEL` | Pino log level | `info` |

Copy `.env` from your own template if needed; `.env` is gitignored.

## API overview

Base path examples use `/v1/tenants/:tenantId/...`. Replace `tenantId` with your tenant identifier.

### Health and metrics

- `GET /healthz` — liveness
- `GET /metrics` — Prometheus exposition format

### Create or upsert a contact

`POST /v1/tenants/:tenantId/contacts`

- **Headers**: optional `Idempotency-Key` for safe retries (same key returns the same logical result; replays use **200**).
- **Body** (JSON): `name` (required), `email` and/or `phoneNumber` (**at least one** of email or phone required).

### Get a contact

`GET /v1/tenants/:tenantId/contacts/:contactId`

### Bulk import (streaming NDJSON)

`POST /v1/tenants/:tenantId/contacts/bulk`

- **Headers**:
  - `Import-Idempotency-Key` — **required**; deduplicates an entire import.
  - `Content-Type: application/x-ndjson`
- **Body**: newline-delimited JSON objects, one contact per line (streamed; not loaded entirely into memory).

### Import status

`GET /v1/tenants/:tenantId/imports/:importId`

## Scripts

| Command | Purpose |
|---------|---------|
| `npm run dev` | Run API with `tsx` watch |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run compiled server |
| `npm run migrate` | Run migrations (requires `build`) |
| `npm run migrate:dev` | Run migrations via `tsx` (no `build` needed) |
| `npm test` | Unit tests |
| `npm run test:integration` | Postgres integration tests |
| `npm run lint` | ESLint |

## Project layout

- `src/api/` — HTTP routes and error mapping
- `src/services/` — business logic
- `src/repositories/` — database access
- `src/domain/`, `src/dto/` — domain types and Zod DTOs
- `src/queue/` — per-tenant write serialization
- `src/observability/` — logging and metrics
- `migrations/` — SQL schema (contacts, idempotency, bulk imports)

## Design notes

- **Uniqueness**: tenant-scoped partial unique indexes on normalized email and E.164 phone; upserts preserve existing `contact_id`.
- **Idempotency**: persisted in `idempotency_records` with request fingerprinting.
- **Bulk**: batches of 500 lines per transaction; import state tracked in `bulk_imports`.

For agent-assisted design and implementation standards, see `.cursor/skills/contact-ingestion-system/`.

## License

Private / unlicensed unless you add a `LICENSE` file.
