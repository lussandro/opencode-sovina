---
name: dev-debugging
description: Use when diagnosing a bug, failing test, crash, wrong output or performance regression, before changing code. Reproduce, isolate, prove the cause, then fix once.
---
# Debugging

Find the cause before touching code. A fix you cannot explain is a guess.

1. **Reproduce.** Get the smallest command or test that fails and run it yourself; do not trust a description of the failure. If it will not reproduce, say so and collect logs, inputs and versions instead of guessing.
2. **Read the real error.** Take the first error, not the last, and the frame in your code, not the library's. Quote it exactly.
3. **Narrow.** Halve the input, the commit range (`git bisect`) or the code path until one component is left. A failing test beats print statements.
4. **Hypothesize.** State a cause that predicts something observable, then test that prediction. Change one thing at a time and revert experiments that did not pan out.
5. **Prove it.** You can make the failure appear and disappear on demand, and the cause explains every symptom, including the odd ones.
6. **Fix the cause, not the symptom.** No retries, sleeps, broad try/catch or null guards to hide it. If the root cause lives elsewhere, say so.
7. **Lock it in.** Add a regression test that fails before the fix and passes after, then run the wider suite.

Check first: recent changes (`git log -p`, dependency bumps), config and environment differences, time zone and locale, ordering and concurrency, stale caches or build output, and any "this can't be null" assumption.

Report: cause, evidence, fix, test added, and anything left unverified.
