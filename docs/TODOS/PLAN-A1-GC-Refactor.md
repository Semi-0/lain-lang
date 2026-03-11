# Plan: A1 GC Refactor — Propagator-Only Dispose & Scheduler-Driven Cell GC

**Status: Implemented** (see §10).

**Goal (from TODO-11-03-2026.md A1):** Expose only propagator `dispose`; scheduler automatically disposes cells when no longer reachable via any propagator.

**Guidelines:** Follow `llm-guideline.md` — small functions, exhaustive logic, tracer-friendly, minimal public API.

---

## 1. Current Behavior (Summary)

| Component | Current behavior |
|-----------|------------------|
| **Propagator** | `propagator.dispose()` only unlinks (removes self from input/output cells' neighbors). `dispose_propagator(prop)` calls `mark_for_disposal(prop)` to enqueue. |
| **Cell** | `cell.dispose()` sets content/strongest to `the_disposed`, `active = false`, alerts `disposing` neighbors. `dispose_cell(cell)` calls `mark_for_disposal(cell)` — so **cells can be enqueued for disposal**. `internal_cell_dispose(cell)` runs `cell.dispose()`. |
| **Generics** | `mark_for_disposal(item)` does `mark_children_for_disposal(item)` then adds `get_id(item)` to the queue. So both cells and propagators (and their children) can be enqueued. |
| **SimpleScheduler** | `cleanup_disposed_items()`: for each id in queue, tries `find_cell_by_id(id)` and `find_propagator_by_id(id)`. If cell: disposes all neighbor propagators, then disposes cell. If propagator: disposes propagator. So **both** cells and propagators are disposed from the queue. |

**Result:** Callers can today request disposal of either a cell or a propagator. The scheduler treats the queue as a mixed set of ids.

---

## 2. Target Contract

- **Public disposal API:** Only **propagator** disposal is exposed. Callers must not request cell disposal directly.
- **Scheduler responsibility:**  
  1. Process disposal queue: only **propagator** ids are ever enqueued. For each id, find propagator, call `propagator.dispose()` (unlink), remove from global state.  
  2. **Cell GC:** After processing all propagator disposals, find all cells that are **unreachable** (no propagator references them). Dispose those cells and remove from global state.
- **Unreachable:** A cell is unreachable iff, after propagator disposals have been applied, it has **zero neighbors** (all propagators that referenced it have been unlinked). We use `cell.getNeighbors().size === 0` as the criterion. Roots (cells never connected to any propagator) also have 0 neighbors; we treat them as unreachable and allow the scheduler to dispose them, unless we later introduce an explicit “root” set.

---

## 3. Files to Change

| File | Role |
|------|------|
| `Propogator/Propagator/Propagator.ts` | Keep propagator.dispose() as unlink-only. Ensure only entry point for “request disposal” is propagator-based (dispose_propagator / mark_for_disposal(propagator)). Remove or narrow any export that allows marking cells. |
| `Propogator/Cell/Cell.ts` | Stop exposing **public** “dispose cell” that enqueues. Keep `internal_cell_dispose(cell)` for scheduler use only. Remove or deprecate `dispose_cell` (or make it internal / document “do not use; cells are GC’d by scheduler”). |
| `Propogator/Shared/Scheduler/SimpleScheduler.ts` | (1) In `cleanup_disposed_items`, process only as **propagator** disposals: for each id, find propagator; if found, call `internal_propagator_dispose(propagator)`, remove from global state. Do **not** look up or dispose cells from the queue. (2) After processing the queue, run **cell GC**: take `cell_snapshot()`, collect cells with `getNeighbors().size === 0`, for each call `internal_cell_dispose(cell)` and remove from global state, then clear the queue. |
| `Propogator/Shared/Generics.ts` | `mark_for_disposal` is today generic (cell or propagator). Restrict so that only **propagators** (and their children) are ever enqueued: either accept only propagator in the public API and have `dispose_cell` removed, or inside `mark_for_disposal` ignore cells (do not add cell id to queue). Prefer: keep `mark_for_disposal(item)` but **do not add id to queue when item is a cell** (only when it’s a propagator/relation that corresponds to a propagator). Easiest: keep Generics as-is but ensure no caller passes a cell (enforce at call sites and by removing `dispose_cell`). |
| `Propogator/Shared/GraphTraversal.ts` | `disposeSubtree(root)` currently calls `p.dispose()` on propagators and `c.dispose()` on cells. Change to: only **mark propagators for disposal** (e.g. `mark_for_disposal(p)` or `dispose_propagator(p)`), then rely on scheduler to run cleanup and cell GC. Do **not** call `cell.dispose()` directly from here; let the scheduler GC unreachable cells. |
| `Propogator/Shared/Scheduler/Scheduler.ts` | No contract change; `mark_for_disposal(id)` remains. Optional: add a short comment that the queue is propagator-only and that cell GC runs in `cleanup_disposed_items`. |

---

## 4. Step-by-Step Implementation

### 4.1 Propagator.ts

- **Keep** `propagator.dispose()` as the low-level unlink (current behavior).
- **Keep** `dispose_propagator(propagator)` calling `mark_for_disposal(propagator)` as the **only** public way to request propagator disposal.
- **Keep** `internal_propagator_dispose(propagator)` for use by the scheduler (calls `propagator.dispose()`).
- **Remove** the unused import `internal_cell_dispose` from Propagator.ts if it is only used in comments or dead code; otherwise leave it for use only inside the scheduler.
- Add a one-line comment above `dispose_propagator`: “Public disposal is propagator-only; scheduler performs cell GC.”

### 4.2 Cell.ts

- **Keep** `cell.dispose()` (internal behavior: set the_disposed, active = false, alert disposing).
- **Keep** `internal_cell_dispose(cell)` and document that it is for **scheduler use only** (cell GC).
- **Remove or deprecate** `dispose_cell(cell)`:
  - **Option A (recommended):** Remove `dispose_cell`. Any existing callers (e.g. `runtime.ts` in lain-lang, or tests) must be updated to never request cell disposal; they only dispose propagators.
  - **Option B:** Keep `dispose_cell` but make it a no-op (or log a warning) and add a comment: “Cell disposal is done by the scheduler when cells become unreachable; do not call.”
- Ensure no export encourages callers to pass a cell to `mark_for_disposal` (enforcement is by removing `dispose_cell` and not adding cell ids in Generics if we go that route).

### 4.3 SimpleScheduler.ts

- **cleanup_disposed_items** (new behavior):
  1. **Propagator phase:** For each `id` in the disposal queue:
     - Call `find_propagator_by_id(id)`.
     - If a propagator is found: call `internal_propagator_dispose(propagator)`, then `set_global_state(PublicStateCommand.REMOVE_PROPAGATOR, propagator)`.
     - If not found: optionally log “propagator not found for disposal” (or skip silently).
     - Do **not** call `find_cell_by_id` or dispose cells in this loop.
  2. **Cell GC phase:**  
     - Let `cells = cell_snapshot()` (or equivalent from PublicState).  
     - **Only collect cells that were inputs/outputs of a propagator just disposed in this cleanup** (“touched” set), and have `getNeighbors().size === 0`. This avoids collecting roots (cells never connected to any propagator).
     - Let `unreachable = cells.filter(c => touchedCellIds.has(cell_id(c)) && c.getNeighbors().size === 0)`.  
     - For each cell in `unreachable`: call `internal_cell_dispose(cell)`, then `set_global_state(PublicStateCommand.REMOVE_CELL, cell)`.
  3. Clear the disposal queue.
- **Helper (optional):** Extract “collect unreachable cells” into a small function, e.g. `collect_unreachable_cells(touchedCellIds): Cell<any>[]`, to keep the 40-line guideline and make the algorithm obvious.
- Remove the old logic that disposed cells from the queue and disposed all neighbors of a cell when the cell was in the queue.

### 4.4 Generics.ts

- **Option A:** Leave `mark_for_disposal(item)` unchanged. Contract: callers must only pass propagators (or relations that map to propagators). Enforce by removing `dispose_cell` and auditing call sites.
- **Option B:** In `mark_for_disposal`, if `item` is a cell (e.g. via `is_cell(item)`), do nothing (and optionally log). This makes the contract robust even if someone calls `mark_for_disposal(cell)` by mistake.
- Recommendation: **Option B** for defense in depth; keep `dispose_cell` removed or no-op.

### 4.5 GraphTraversal.ts

- **disposeSubtree(root):**  
  - Compute `trace_cell(root)` as today.  
  - For each propagator in the result, call `dispose_propagator(p)` (or `mark_for_disposal(p)`) instead of `p.dispose()`.  
  - Remove the loop that calls `c.dispose()` on cells.  
  - Document: “Disposes the downstream subgraph by marking propagators for disposal; the scheduler will run cleanup and GC unreachable cells (including these).”
- Callers of `disposeSubtree` must run the scheduler’s `cleanup_disposed_items()` (e.g. after `execute_all_tasks_sequential`) to actually perform disposal and cell GC.

### 4.6 Call sites (lain-lang / runtime)

- The TODO states that `runtime.ts` uses both `dispose_cell` and `dispose_propagator`. If `runtime.ts` (or any file under lain-lang) is found to call `dispose_cell` or `mark_for_disposal(cell)`:
  - Replace with disposing only the **propagators** that reference the card/network (e.g. mark those propagators for disposal), then rely on scheduler cleanup and cell GC.
- Search the repo for `dispose_cell`, `internal_cell_dispose` (except in Propogator scheduler and Cell.ts), and `mark_for_disposal` with a cell argument; update or remove.
- **Card API / proposal logic:** When rewriting detach, remove_card, or build_card rebuild (see §9), ensure only propagators are marked for disposal so that `lain-lang/test/card_api.test.ts` continues to pass.

---

## 5. Observability (per llm-guideline)

- **Tracers:** Keep or add optional logging (e.g. behind a flag) in `cleanup_disposed_items`: number of propagators disposed, number of cells collected in GC. No need to log every id unless debugging.
- **Failure mode:** If a cell is never connected to any propagator, it will have 0 neighbors and be collected. If “roots” are needed later, add an explicit root set and exclude those from the unreachable set.

---

## 6. Testing

- **Unit / integration:** After refactor, run existing Propogator tests (and any lain-lang tests that touch disposal). Ensure:
  - Disposing a propagator still removes it and unlinks from cells.
  - After `cleanup_disposed_items`, cells that lost all propagator references are disposed and removed from global state.
  - `disposeSubtree` plus scheduler cleanup still clears the subgraph without leaving dangling cells.
- **Regression:** No caller should call `dispose_cell`; grep for it and fix or remove.
- **Card API:** All tests in `lain-lang/test/card_api.test.ts` must pass (see §9 for acceptance criteria). Run `card_api.test.ts` after the refactor and after any proposal-logic rewrite to confirm disposal behaves correctly.
- **Cell GC unit tests:** `lain-lang/test/propagator_gc.test.ts` — two tests: (1) unreachable cells are garbage-collected after propagator disposal; (2) cells with remaining propagator references are not collected. Run these to verify scheduler cell GC behavior.

---

## 7. Order of Work

1. **SimpleScheduler.ts** — Implement new `cleanup_disposed_items` (propagator-only queue processing + cell GC). Keep the queue type as `Set<string>`; semantics change to “ids are propagator ids only.”
2. **Generics.ts** — If using Option B: in `mark_for_disposal`, if item is a cell, no-op (and optionally warn).
3. **Cell.ts** — Remove `dispose_cell` or make it a no-op with a comment; document `internal_cell_dispose` as scheduler-only.
4. **Propagator.ts** — Add comment; remove unused `internal_cell_dispose` import if not used.
5. **GraphTraversal.ts** — Change `disposeSubtree` to only mark propagators for disposal; remove direct cell dispose.
6. **Call sites** — Search and update any `dispose_cell` or cell-based `mark_for_disposal` in lain-lang or tests.

---

## 8. Summary

| Before | After |
|--------|--------|
| Callers can dispose cells or propagators | Callers can only request propagator disposal |
| Scheduler disposes whatever ids are in the queue (cells or propagators) | Scheduler only enqueues propagator ids; after disposing them, runs cell GC for unreachable cells |
| dispose_cell(cell) enqueues cell | dispose_cell removed or no-op; cells are GC’d by scheduler |
| disposeSubtree disposes propagators and cells directly | disposeSubtree only marks propagators; scheduler does cleanup + cell GC |

This plan keeps the public API minimal (propagator-only dispose), centralizes cell lifecycle in the scheduler, and aligns with TODO A1 and the llm-guideline.

---

## 9. Card API test criteria and proposal logic

**Criterion:** When we rewrite proposal logic (detach, remove_card, build_card rebuild), disposal must be **propagator-only** so that `lain-lang/test/card_api.test.ts` continues to pass and disposes properly.

### 9.1 What the tests assume

- **Detach / remove_card:** Tests run `execute_all_tasks_sequential()` after `detach_cards` or `remove_card` so that “cleanup” runs (see file header and tests 1, 1b, 4, 6, 7). After that run:
  - Propagators that were marked for disposal (connector, bi_sync children) are disposed and removed from global state.
  - Cells that become unreachable (e.g. connector cells that only had those propagators as neighbors) are disposed by **cell GC** and removed from global state.
- **Storage / topology:** After `remove_card("ra")` + `execute_all_tasks_sequential()`, `detach_cards_by_key("ra", "rb")` must return Left (“Connector not found”) — i.e. connector storage is cleared and topology reflects disposal.
- **Rebuild:** “build_card rebuild disposes old internal compile network” (test around line 396): after a second `build_card` + `execute_all_tasks_sequential()`, the new internal network runs and old one is gone. So rebuild path must mark **only propagators** of the old network for disposal; scheduler cleanup + cell GC then remove them and any orphaned cells.

### 9.2 Contract for card runtime / proposal logic

- **detach_cards / detach_cards_by_key:** Must only **mark propagators** for disposal (e.g. connector propagator and any bi_sync / compound children). Do **not** call `dispose_cell` or enqueue cells. Rely on scheduler `cleanup_disposed_items()` (invoked by `execute_all_tasks_sequential`) to run propagator disposal then cell GC.
- **remove_card:** Must only mark for disposal the **propagators** associated with that card (connectors, internal network). Do not dispose card cells directly; if after propagator disposal some cells become unreachable, cell GC will dispose them when cleanup runs.
- **build_card rebuild (replace internal network):** Must only mark for disposal the **propagators** of the previous internal compile network. Do not dispose cells directly. Scheduler cleanup + cell GC will remove disposed propagators and then any cells that have no remaining neighbors.

### 9.3 Acceptance criteria (card_api.test.ts)

After the A1 refactor and any proposal-logic rewrite:

1. **All existing tests in `lain-lang/test/card_api.test.ts` must pass** without changing test expectations (e.g. “detach then execute → propagation stops”, “remove_card then execute → detach_cards_by_key returns Left”, “rebuild disposes old network”).
2. **No test may call `dispose_cell`** (or equivalent). Tests may only trigger disposal by: detach, remove_card, or rebuild, which in turn only mark propagators for disposal; cleanup runs inside `execute_all_tasks_sequential()`.
3. **Lifecycle tests** (e.g. 1, 1b, 2, 4, 6, 7) that do detach/remove then `execute_all_tasks_sequential()` must still see propagation stop and storage/topology updated — i.e. scheduler’s `cleanup_disposed_items()` (propagator phase + cell GC phase) must run and complete the disposal.

### 9.4 Where to align when rewriting proposal logic

- **lain-lang card runtime / grpc/card:** Wherever detach, remove_card, or rebuild currently call `dispose_cell` or `mark_for_disposal(cell)` or dispose cells directly, change to **only** marking the relevant **propagators** for disposal (e.g. via `dispose_propagator` or `mark_for_disposal(propagator)`). Ensure `execute_all_tasks_sequential()` is the single place that runs scheduler cleanup (and thus cell GC) so that card_api tests keep their “detach/remove then execute” pattern.

### 9.5 Post-refactor: rebuild and inner propagators

After implementing A1, **build_card rebuild** only marks the **compound** internal network for disposal. The compound’s `getInputs()`/`getOutputs()` are `[]`, and inner propagators (created inside `compile_card_internal_code`) are not relation-children of the compound, so they are not enqueued by `mark_for_disposal(compound)`. As a result, tests that rely on “old internal network fully disposed on rebuild” (e.g. “7b. rebuild center code switches from +1 to +2”) may fail until the card runtime marks the **inner** propagators for disposal on rebuild (e.g. by having the compound record its child propagators when it builds, and marking those in `dispose_card_internal_network_io`).

---

## 10. Implementation summary

- **Propogator:** SimpleScheduler.ts (propagator-only queue + touched-cells GC), Generics.ts (cell no-op in `mark_for_disposal`), Cell.ts (`dispose_cell` no-op, `internal_cell_dispose` scheduler-only), Propagator.ts (comment), GraphTraversal.ts (`disposeSubtree` only marks propagators).
- **lain-lang:** No call-site changes (no `dispose_cell` callers; `runtime_remove_card` still calls `dispose_cell(card)` which is now a no-op).
- **Tests:** `test/propagator_gc.test.ts` added for unreachable-cell GC; `test/card_api.test.ts` — 37 pass, 2 known failures (rebuild/inner propagators) per §9.5.
