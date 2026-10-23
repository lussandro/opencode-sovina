---
name: dev-testing
description: Use when writing or changing tests, fixing a bug, or deciding what to test. Covers test selection, regression-first fixes, determinism and flaky tests. Not for browser E2E tooling setup.
---
# Testing

Tests exist to catch regressions and document behavior. Write the fewest that would fail if the code were wrong.

- **Bug fix:** write the failing test first and watch it fail for the right reason, then fix.
- **Test behavior through the public interface.** Not private functions, call counts or internal structure.
- **Cover what breaks:** empty, boundary, invalid, duplicate, concurrent, error path, and anything with money, dates, time zones or permissions.
- **Pick the lowest level that proves it.** Unit for logic. Integration at the database and HTTP edges, against a real database when feasible. E2E only for the few journeys that must never break.
- **Mock only what you do not own** (network, clock, third parties). Prefer fakes. Assert outcomes, not that a mock was called.
- **Deterministic:** inject clock, randomness and ids; no sleeps, no real network; each test creates its own data and passes in any order.
- **A test that cannot fail is worthless.** Break the code once and see it go red.
- **One reason to fail per test.** The name states the behavior; the failure message should say what broke.

## Flaky tests
Reproduce by looping the single test. Look for shared state, time, ordering, unawaited async and races. Never retry-until-green or skip without recording why.

## Finishing
Run the relevant tests and report real counts. "It compiles" is not "it works". Coverage is a hint, not a goal.
