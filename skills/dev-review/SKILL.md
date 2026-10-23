---
name: dev-review
description: Use when reviewing a diff, pull request or your own changes before finishing. Finds correctness, regression, security and scope problems, ordered by severity.
---
# Review

Read the whole diff and the intent behind it (ticket, PR text, commit messages) before judging.

Check, in this order:
1. **Correctness:** edge cases, null and empty, off-by-one, error paths, concurrency, resource cleanup.
2. **Regressions:** callers of changed code, public contracts, migrations, config defaults, behavior that used to work.
3. **Security:** authorization, input validation, injection, secrets, data exposure in logs and responses.
4. **Tests:** do they cover the change, and would they fail without it? Run them when cheap instead of assuming.
5. **Scope:** unrelated edits, dead code, leftover debugging, files that should not be committed.
6. **Maintainability:** naming, duplication, needless abstraction. Lowest priority.

## Output
List findings by severity (`blocker`, `major`, `minor`, `nit`). For each: `file:line`, what is wrong, why it matters, and a concrete fix. State what you verified and what you did not. Skip praise and padding; if nothing is wrong, say so and list what you checked.
