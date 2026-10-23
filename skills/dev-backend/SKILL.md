---
name: dev-backend
description: Use when writing or changing backend code: HTTP endpoints, services, database access and migrations, queues, webhooks, anything touching money or fiscal data. Node, NestJS and Prisma oriented.
---
# Backend

- **Validate at the edge** (DTO or schema), reject unknown fields, then trust the types inside. Check authorization on every endpoint: ownership or tenant, not only "is logged in".
- **Money is never a float.** Use integer minor units or `Decimal`, with an explicit rounding rule. Store timestamps in UTC; convert only for display.
- **One business operation, one transaction.** Keep it short and make no network calls inside. Interactive Prisma transactions time out (5 s by default).
- **Writes that can be retried must be idempotent:** webhooks, payments, fiscal emission, queue jobs. Use an idempotency key or a unique constraint and treat a duplicate as success.
- **Let the database enforce invariants.** Unique constraints and upsert instead of check-then-insert; a version column or `FOR UPDATE` where two writers can race.
- **Queries:** avoid N+1 (batch or `include`), select only needed columns, paginate with a stable order, index what you filter and sort by, and read `EXPLAIN` when it is slow.
- **Migrations:** expand, backfill, then enforce. Never edit an applied migration. Never run `prisma migrate dev` against a shared or production database; use `migrate deploy`.
- **Prisma:** `updateMany` and `deleteMany` return a count, not rows.
- **External calls:** set a timeout; retry with backoff only operations that are safe to repeat.
- **Errors:** map domain errors to the right HTTP status and a stable error code. Log with a correlation id. Never log secrets, tokens or personal documents (CPF, card data), and never return stack traces.

Before finishing: typecheck, lint, tests, and apply the migration to an empty database.
