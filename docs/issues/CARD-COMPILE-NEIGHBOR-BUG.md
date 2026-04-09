# Card compile / neighbor-order bug (known red)

This document records a **known failure** in the card gRPC path: compiling linked cards in a naive order, or before neighbor slots carry numeric values, breaks subtraction and/or leaves the sink at `the_nothing`.

**Status:** Unfixed. The regression probe below is **intentionally failing** — do not “green” it by weakening the test; fix the engine or scheduler ordering instead.

## Reproduction

Run:

```bash
bun test test/card_api.test.ts -t "BUG PROBE: swap mids"
```

**Test location:** `test/card_api.test.ts` → `describe("BUG PROBE: swap mids + (+2)/(−20) rebuild (expected failure)", …)`.

## What the probe does

1. Four cards: numeric **SRC**, mids **A** / **B**, numeric **SINK**.
2. Formulas:
   - A: `(+ ::left 2 ::right)`
   - B: `(- ::left 20 ::right)`
3. Horizontal chain: `SRC — mid — mid — SINK` (right/left connectors, same convention as other `card_api` tests).
4. Each round (up to 250):
   - **Detach** the three edges, then **swap** topology: `SRC–A–B–SINK` ↔ `SRC–B–A–SINK`.
   - **Reconnect**, `update_card` both formulas, then **`build_card(A)` always before `build_card(B)`** (deliberately wrong when the source-adjacent mid is B).
   - **No** `update_card(SRC, …)` before those builds (neighbors may not be numeric during compile).
   - Then `update_card(SRC, 300 + round)`, flush, assert `SINK::this === srcVal - 18`.

The probe logs the **first failing round** to stderr:

```text
[BUG PROBE: swap mids] first failure at round …
```

## Observed failure modes

### 1. Subtract during compile with non-numeric `::left`

During `build_card(B)` the scheduler runs `execute_all_tasks_sequential`. The `(- …)` propagator can fire while B’s `::left` is **not** a number — e.g. strongest base looks like the **string** `(+ ::left 2 ::right)` (code-shaped) instead of a numeric flow from A’s `::right`.

That yields:

```text
default generic subtract: expected two numbers, but got string and number
```

(stack through generic arithmetic / layered dispatch).

### 2. Sink stays `&&the_nothing&&`

Even when no exception is thrown, after updating `SRC` the sink may never receive `srcVal + 2 - 20`. The assertion fails, e.g. **round 0**: expected `282`, got `&&the_nothing&&` for `srcVal === 300`.

This indicates the **numeric pipeline** from `SRC` through A/B to `SINK` did not stabilize under this build order and timing.

## Why this matters

- **Realistic bad order:** UIs or transports may compile cards in id order, not source-to-sink order.
- **No pre-seed:** Compiling before the source cell has been written is plausible on reconnect or lazy load.
- **Mixed primitives:** `+` may tolerate partial inputs longer than `-`, so the bug shows up with `(- ::left 20 ::right)` on the second mid.

## Related code

- Card metadata / build flush: `src/grpc/card/card_metadata.ts` (`card_metadata_build`, `execute_all_tasks_sequential` after compile).
- Lifecycle API: `src/grpc/card/card_lifecycle.ts`, `test/card_api.test.ts` (topology helpers, `read_slot_value`).

## Policy

- **Do not** `test.skip` / `describe.skip` this probe to hide CI red unless CI is split into “required” vs “known-failing” jobs and that split is documented.
- **Do not** change the probe to a passing “happy path” only; a separate test can document the correct source→sink build order once the bug is fixed.
- Prefer fixing: neighbor visibility during compile, ordering guarantees, or subtract’s handling of unusable inputs — then keep this probe as a guard or tighten it to assert success.
