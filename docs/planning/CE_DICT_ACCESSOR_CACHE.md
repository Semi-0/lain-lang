# ce_dict_accessor cache (Propogator)

## Summary

The cache in **Propogator/DataTypes/CarriedCell/Dict.ts** is **disabled**. `ce_dict_accessor` creates a new accessor on each call. Card API works without the cache by ensuring `execute_all_tasks_sequential` runs before any read from a slot accessor, so bi_sync propagates values. The cache was removed to avoid unwanted interaction with the disposal system.

## Root cause: referential identity

- Cards are dict carriers: a card cell’s value is a `Map<string, Cell>` where keys are slot names (`::this`, `::left`, etc.).
- **lain-lang** uses `internal_cell_this(card)` (and other `internal_cell_*`) which are implemented as `ce_dict_accessor(slot)(card)`. So “the `::this` of this card” is that accessor cell.

Multiple parts of the system assume that for a given card and slot, they all see the **same** cell instance:

1. **Runtime (lain-lang)**  
   - `bind_card_to_user_inputs` does `internal_cell_this(card)` and stores it in `source_this_cell_storage` and wires it to the shared source.  
   - `runtime_update_card` updates that stored cell via `update_source_cell`.  
   - So **updates** go to the accessor that was created the first time (when the card was added).

2. **Same slot, different call sites**  
   - `p_emit_card_internal_updates_to_runtime` uses `internal_cell_this(card)` to watch the card’s `::this`.  
   - Tests do `cell_strongest_base_value(internal_cell_this(right))` to assert propagated values.  
   - If each of these calls creates a **new** accessor (cache off), then:
     - The cell that receives user updates is **A** (stored in `source_this_cell_storage`).
     - The cell that emit watches can be **B** (different instance).
     - The cell the test reads can be **C** (another instance).
   - `merge_carried_map` will `bi_sync` new accessors with the one already in the container, but:
     - The sync may not have run before the test reads **C**, so **C** can still be empty/stale.
     - The runtime’s idempotency check in `runtime_update_card` reads from a fresh accessor **D**; that read can be stale, so the check can be wrong.

So without the cache, “the `::this` of card X” is no longer a single cell; it’s multiple cells that are only eventually synced. Any code that stores or assumes a single canonical cell per (key, container) breaks.

## What the cache guarantees

- For a given `(key, container)`, every call to `ce_dict_accessor(key)(container)` returns the **same** accessor cell.
- So:
  - The runtime stores and updates one cell; emit and tests read the same cell.
  - No extra accessors, no read-your-own-write ordering issues.

## Hypothesis: value consistency via bi_sync (without cache)

**merge_carried_map** bi_syncs multiple accessors for the same key, so after propagation runs, all accessors for that (container, key) hold the same value. So we get **value consistency** even without caching accessor identity.

- **Propogator tests** (Propogator/test/carriedCell.test.ts "multiple accessors for same key"): two accessors for the same key; update one, run execute, the other sees the value. A third accessor created after the update sees the_nothing until we run execute again, then it sees the value.
- **Card API test** (lain-lang/test/card_api.test.ts "1c. hypothesis: uncached accessor sees value after execute"): with cache OFF, if we call internal_cell_this(right) (fresh accessor) and then run execute_all_tasks_sequential() before reading, we see the propagated value. So the failure without cache is **read-before-propagation**: code that reads from a freshly created accessor without running execute first sees stale/nothing.

So the cache is one way to get consistent behavior (same cell everywhere). Alternatively, callers could run execute_all_tasks_sequential after any path that might create a new accessor, before reading—then bi_sync gives value consistency. We have adopted the execute-before-read approach; the cache is disabled.

## Solution (cache off)

(1) Propogator: cache removed. (2) runtime_update_card: run execute_all_tasks_sequential before reading current_value. (3) Tests: use read_slot_value; for topology use cells_connected_via_propagator_graph and propagators_connected_to_cell.