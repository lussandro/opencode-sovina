---
name: dev-infra
description: Use when editing Dockerfiles, docker compose, CI pipelines, deployment, environment config, secrets or rollback procedures.
---
# Infra

- **Images:** pin versions (tag and digest in production), multi-stage, small base, non-root user, a `.dockerignore`. Copy dependency manifests before source so layers cache. Never put secrets in layers, build args or the repo.
- **Config comes from the environment.** Validate it at startup and fail fast. Keep secrets apart from plain config; if one leaks, rotate it.
- **Compose:** healthchecks with `depends_on: condition: service_healthy`, named volumes for data, publish ports on `127.0.0.1` unless they must be public.
- **CI:** frozen-lockfile installs (`npm ci` and equivalents), lint, typecheck, tests and build on every change, pinned action versions, cached dependencies.
- **Deploy:** run migrations as an explicit step before the new version and keep them backward compatible. Add readiness and liveness probes, handle `SIGTERM` for graceful shutdown, deploy small, and keep a one-command rollback.
- **Least privilege:** scoped roles and credentials, no root, no `latest`, no `chmod 777`.
- **Observability:** structured logs to stdout with a request id, basic error and latency alerts, no secrets or personal data in logs.
- **Destructive commands** (`down -v`, `prune`, force push, `DROP`, deleting volumes): state exactly what will be lost and get confirmation first.

Verify: build the image from scratch, run it with only the documented environment, hit the health endpoint and read the logs; validate compose files with `docker compose config`.
