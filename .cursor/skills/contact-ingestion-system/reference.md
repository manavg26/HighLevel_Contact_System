# Contact Ingestion System — full requirements (verbatim)

The following sections reproduce the authoritative product and engineering specification. Implementations must satisfy this document unless explicitly superseded by newer repo decisions documented in code review.

---

Act as a Senior Staff Backend Engineer designing and implementing a production-grade Contact Ingestion System.

Your goal is to redesign or recreate this system from scratch while preserving all existing engineering standards, coding conventions, observability practices, and reliability guarantees.

-----------------------------------
BUSINESS CONTEXT
-----------------------------------

We are building a multi-tenant Contact Management platform.

The system must support:

1. Single Contact Creation
2. Bulk Contact Creation

Primary methods:

createContact(tenantId, contactPayload, idempotencyKey)

bulkCreateContacts(tenantId, contacts[], importIdempotencyKey)

getContact(contactId)

-----------------------------------
FUNCTIONAL REQUIREMENTS
-----------------------------------

Contact fields:

- name
- email
- phoneNumber

Validation rules:

1. Either email OR phoneNumber must be present.
2. If both are missing, reject with 4xx validation error.
3. Email must be normalized before persistence:
   - trim whitespace
   - lowercase
4. Phone numbers should be normalized if applicable based on existing utility standards.

Deduplication rules:

1. No duplicate contacts allowed per tenant.
2. email must be unique per tenant.
3. phoneNumber must be unique per tenant.
4. If a duplicate exists:
   - perform upsert
   - preserve existing contactId
   - return existing contactId

Identity rules:

1. Every contact has a globally unique internal contactId.
2. contactId should be stable across retries.

Idempotency:

1. Single inserts must support idempotencyKey.
2. Bulk imports must support importIdempotencyKey.
3. Retries must not create duplicates.
4. Same idempotency key must return the original created resource.

Concurrency:

1. Concurrent inserts for same contact must not create duplicates.
2. Data integrity must be guaranteed.
3. An in-memory queue may be used initially to serialize writes.
4. Database constraints remain the ultimate source of truth.

Bulk Import Constraints:

1. Batch size = 500 contacts.
2. Input files can be up to 1 GB.
3. File parsing must be streaming-based.
4. System must not load full file into memory.

-----------------------------------
NON-FUNCTIONAL REQUIREMENTS
-----------------------------------

The system must be:

- Horizontally scalable
- Retry safe
- Race-condition safe
- Idempotent
- Highly observable
- Production ready

Optimize for:

1. Data correctness
2. Reliability
3. Maintainability
4. Operational simplicity
5. Performance

-----------------------------------
TECH STACK
-----------------------------------

Use:

- Backend: follow existing project stack
- Database: PostgreSQL
- Queue: in-memory initially, but design for migration to distributed queue later

-----------------------------------
IMPLEMENTATION REQUIREMENTS
-----------------------------------

Follow all existing project engineering standards.

1. Follow existing folder structure.
2. Follow existing naming conventions.
3. Follow existing dependency injection patterns.
4. Follow existing DTO/entity/service/repository patterns.
5. Follow existing coding style and linting rules.
6. Do not introduce patterns inconsistent with existing codebase.

-----------------------------------
DATABASE DESIGN
-----------------------------------

Design:

1. contacts table
2. idempotency table
3. bulk import tracking table

Include:

- indexes
- partial unique indexes
- constraints
- migration scripts

Handle:

- UPSERT logic
- conflict resolution
- transaction boundaries

Explain all schema decisions.

-----------------------------------
API DESIGN
-----------------------------------

Design REST APIs including:

Request payloads
Response payloads
Error payloads
Status codes

Include:

- validation errors
- conflict errors
- retry responses
- idempotent replay responses

-----------------------------------
CONCURRENCY DESIGN
-----------------------------------

Design for:

1. Multiple concurrent inserts for same contact
2. Duplicate request retries
3. Race conditions
4. Worker queue processing

Explain:

- locking strategy
- queue partitioning strategy
- DB conflict handling strategy

-----------------------------------
LOGGING REQUIREMENTS
-----------------------------------

Follow existing logging framework and standards.

Implement structured logs for:

1. Request received
2. Validation failures
3. Dedupe detection
4. DB writes
5. Queue enqueue/dequeue
6. Retry detection
7. Conflict detection
8. Bulk import progress
9. Failures

Logs must include:

- requestId
- tenantId
- contactId (if available)
- idempotencyKey
- latency
- operation type

Sensitive fields like email/phone must be masked according to existing standards.

-----------------------------------
ERROR HANDLING REQUIREMENTS
-----------------------------------

Follow existing exception handling framework.

Generate:

1. Domain exceptions
2. Validation exceptions
3. Conflict exceptions
4. Retry-safe DB exceptions
5. Bulk import partial failure handling

Every error must include:

- error code
- user-friendly message
- internal diagnostic context

Do not leak internal DB details.

-----------------------------------
OBSERVABILITY
-----------------------------------

Add:

Metrics:

- contacts.created
- contacts.updated
- contacts.duplicates
- contacts.validation_failed
- contacts.bulk_import_success
- contacts.bulk_import_failed

Timers:

- DB latency
- Queue latency
- API latency

Tracing:

- request flow across API → queue → worker → DB

-----------------------------------
TESTING REQUIREMENTS
-----------------------------------

Generate complete test coverage.

Unit Tests:

1. Email normalization
2. Validation rules
3. Deduplication logic
4. Idempotency behavior
5. Conflict handling

Integration Tests:

1. PostgreSQL upsert tests
2. Unique constraint tests
3. Transaction rollback tests
4. Concurrent insert tests

Concurrency Tests:

1. 100 parallel duplicate requests
2. Same idempotency key retries
3. Race condition verification

Bulk Tests:

1. 1 GB streaming import
2. Batch processing correctness
3. Partial failure handling

Failure Tests:

1. DB unavailable
2. Queue failure
3. Worker crash recovery

For every test provide:

- setup
- execution
- expected assertions

-----------------------------------
DELIVERABLE FORMAT
-----------------------------------

Generate output in this order:

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

Always challenge weak design choices and propose better alternatives when needed.
Prefer production-grade patterns over interview-style shortcuts.
