---
name: contact-ingestion-system
description: >-
  Guides redesign or greenfield implementation of a production-grade multi-tenant
  Contact Ingestion API (single/bulk create, idempotency, dedupe, PostgreSQL,
  in-memory queue with path to distributed queues). Use when designing or
  changing contact ingestion, bulk import, tenant write serialization,
  idempotency keys, upsert/dedupe semantics, migrations, observability, or tests
  in this repository.
disable-model-invocation: true
---

# Contact Ingestion System (Staff Engineer)

## Role

Act as a **Senior Staff Backend Engineer**. When asked to design, redesign, or recreate the contact ingestion system, produce **production-grade** designs and code. Prefer correctness and operability over shortcuts. **Challenge weak design choices** and propose stronger alternatives with trade-offs.

## Source of truth

1. Read **[reference.md](reference.md)** for the full functional, non-functional, API, DB, logging, observability, and testing requirements (verbatim specification).
2. Align every change with **existing repo conventions** before inventing new patterns.

## Project anchors (this codebase)

- **Stack**: Node 20+, TypeScript (ESM), Fastify, `pg`, Zod, Pino, `prom-client`, Vitest.
- **Composition / DI**: Wire dependencies in `src/compositionRoot.ts` (`createDependencies`); inject `pool`, `env`, `log`, `metrics`, repositories, queue, services.
- **Layers**: `src/domain/`, `src/dto/`, `src/services/`, `src/repositories/`, `src/api/`, `src/db/`, `src/queue/`, `src/observability/`, `src/lib/`, `migrations/`.
- **PII in logs**: Use `src/lib/pii.ts` (`maskEmail`, `maskPhone`); do not log raw email or phone.
- **Phone/email normalization**: Follow `src/lib/phone.ts`, `src/lib/email.ts`, `src/lib/fingerprint.ts` and existing DTO validation.
- **Migrations**: SQL under `migrations/`; align with `src/db/runMigrations.ts` / `src/migrate.ts`.
- **Lint**: `eslint.config.js`; match import style (`.js` extensions in TS sources where used), naming, and error mapping in `src/api/errorMapper.ts`.

## Mandatory design output order

When producing a design document or implementation plan (not necessarily every small edit), cover topics in this **exact order**:

1. Requirement clarification  
2. Edge cases  
3. High-level design  
4. Low-level design  
5. DB schema  
6. API contracts  
7. Service layer design  
8. Queue design  
9. Concurrency strategy  
10. Error handling strategy  
11. Logging strategy  
12. Observability strategy  
13. Test strategy  
14. Production rollout strategy  
15. Future scaling improvements  

Within each section, be explicit about **transaction boundaries**, **conflict handling**, **idempotent replay**, and **what the DB guarantees vs what the app assumes**.

## Implementation rules

- **Preserve** engineering standards: observability (structured logs + metrics), reliability (idempotency, upsert, constraints), and existing abstractions unless a migration plan justifies a break.
- **DB is source of truth** for uniqueness and races; in-memory queue serializes per tenant as an optimization, not a substitute for constraints.
- **Bulk**: streaming parse, batches of 500, no full-file memory load; track bulk import state in DB per reference.
- **Errors**: stable `error` codes, safe client messages, rich **internal** context in logs only; never expose raw SQL or connection strings.
- **Tests**: unit + integration + concurrency scenarios from reference; document setup, execution, and assertions for new suites.

## Anti-patterns

- Relying on queue ordering alone for dedupe without unique indexes.
- Loading large imports entirely into memory.
- Logging unmasked PII.
- New folder layouts or DI styles inconsistent with `compositionRoot` and existing services.

## When scope is ambiguous

Ask minimal clarifying questions (e.g. public API versioning, SLA for bulk completion, multi-region) before locking schema or API paths; otherwise state assumptions explicitly in section 1 of the deliverable.
