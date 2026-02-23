# Backend Architecture: Two-Part Separation

**Status:** IN PROGRESS (Part A->Part B wiring + CardBuild implemented; spawn still pending)  
**Aligned with:** [CARDS-IMPLEMENTATION-PLAN.md](./CARDS-IMPLEMENTATION-PLAN.md)

---

## Overview

The backend is split into two parts:

1. **Part A — Slot-to-Event Layer:** Transforms reserved slot updates (CardsDelta) into **card events** and handles **cards-updates I/O** (sends slot updates back to the frontend).
2. **Part B — Structure & Propagation Layer:** Consumes card events and card slot updates to **rebuild the card structure** and **build the propagation graph**.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  connect_server (Session / OpenSession + PushDeltas)                         │
│  receives CardsDelta (slot updates)                                          │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PART A: Slot-to-Event Layer                                                 │
│  • Parse reserved slot updates (directional: CardIdRef, CardDesc; code, etc.)│
│  • Reducer: diff prev/next → infer events                                    │
│  • Emit: CardDetach | CardConnect | CardAdd | CardRemove | SpawnRequest     │
│  • Observe Part B runtime output events (::this)                             │
│  • Cards-updates I/O: send slot updates (CardUpdate, Heartbeat) to frontend  │
└─────────────────────────────────────────────────────────────────────────────┘
                                       │
                    card events        │        slot updates (out)
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  PART B: Structure & Propagation Layer                                       │
│  • Maintain: cards { card_id, code_string }, edges { from, dir, to }         │
│  • Apply events: add/remove cards, connect/detach edges                      │
│  • Build propagation graph: CarriedCells, bi_sync wiring                     │
│  • Compile per card (localized env)                                          │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Part A: Slot-to-Event Layer

**Input:** Reserved slot updates from CardsDelta (decoded slot map, including directional slots with `CardIdRef`, `CardDesc`, etc.).

**Responsibilities:**

1. **Maintain previous slot state** per session.
2. **Apply delta** to get next slot map.
3. **Diff directional structural refs** only (type law: only `CardIdRef`, `CardDesc` trigger topology ops).
4. **Infer card events:**
   - `nil → CardIdRef(B)` → **CardConnect** (A-dir to B)
   - `CardIdRef(B) → nil` → **CardDetach** (A-dir from B)
   - `CardIdRef(B) → CardIdRef(C)` → **CardDetach** then **CardConnect**
   - `nil → CardDesc(code)` → **SpawnRequest(A, dir, CardDesc)** (or **CardSpawnRequested**) — intent inferred from slot diff; materialization is Part B's responsibility
   - `CardDesc(code) → nil` → cancel spawn
5. **Cards-updates I/O:** Produce `ServerMessage` (Heartbeat, CardUpdate) and send to frontend. This includes:
   - Reflecting slot changes (set/remove) as CardUpdate
   - Heartbeats for connection health

**Output:**
- Stream of **card events** (CardDetach, CardConnect, CardAdd, CardRemove, SpawnRequest) to Part B.
- Stream of **ServerMessage** (Heartbeat, CardUpdate) to frontend.

**Location:** Lives in/alongside `connect_server.ts` and `card_slot_sync.ts` — applies delta, computes structural changes, syncs Part B, and yields ServerMessage.

---

## Part B: Structure & Propagation Layer

**Input:**
- **Card events** from Part A (CardDetach, CardConnect, CardAdd, CardRemove, SpawnRequest).
- **Card slot updates** (the current slot map after Part A’s reducer); used to know code strings, refs, and to derive structural truth.

**Responsibilities:**

1. **Maintain structural state:**
   - `cards: { card_id, code_string }` — via `card_storage`
   - `edges: { from_card_id, direction, to_card_id }` — via `connector_storage`
2. **Apply events:**
   - **CardAdd:** `add_card(id)` — create card, add to storage.
   - **CardRemove:** `remove_card(id)` — detach incident connectors, dispose card.
   - **CardConnect:** `connect_cards(cardA, cardB, slotA, slotB)` — add bi_sync connector.
   - **CardDetach:** `detach_cards(cardA, cardB)` — dispose connector, remove from storage.
   - **SpawnRequest(A, dir, CardDesc):** *Not yet implemented.* TODO: materialize new card from CardDesc when direction is unoccupied.
   - **BuildCard(cardId):** `build_card(env)(id)` — create card with CarriedCells, unfold internal network, compile.
3. **Build propagation graph:**
   - Build CarriedCell per card (::this, ::left, ::right, ::above, ::below) — `p_construct_card_cell`, `unfold_card_internal_network`.
   - Wire `bi_sync` per adjacency via `card_connector_constructor_cell` (slot cells ↔ neighbor ::this).
   - Compile per card via `compile_card_internal_code` (incremental compiler).
4. **Emit runtime output events (observer hook):**
   - Part B emits card runtime updates (`card_id`, `::this`, `value`) via `emit_runtime_card_output_io`.
   - Part A bridges runtime outputs to frontend `CardUpdate` via a MiniReactor pipeline.

**Output:**
- Updated propagation network (cells, propagators).
- Runtime output events (`::this`) to Part A callback channel.

**Implementation (Part B):** `src/grpc/card/` — `card_api.ts` (unified API), `storage.ts` (add/remove/connect/detach), `schema.ts` (card structure, slots, connectors), and split internals `graph.ts` (structural model) + `runtime.ts` (cells/propagators lifecycle). Slot-map synchronization is now wired via `src/grpc/card_slot_sync.ts`.

---

## Card Event Types

| Event                | Meaning                                                         |
|----------------------|------------------------------------------------------------------|
| **CardAdd**          | New card created                                                |
| **CardRemove**       | Card removed from structure                                     |
| **CardConnect**      | Edge added (A-dir to B)                                         |
| **CardDetach**       | Edge removed; card may become orphan                            |
| **SpawnRequest(A, dir, CardDesc)** | Intent inferred from slot diff; Part B accepts or rejects |
| **CardMaterialized(newId)**       | Internal (Part B): spawn accepted; new card created       |
| **BuildCard(cardId)**             | User pressed Build on a card; triggers compile for that card (manual; auto-diff planned for later stage) |

---

## Data Flow Summary

```
CardsDelta (slots + remove)
        │
        ▼
┌───────────────────┐
│  Part A: Reducer  │  prev_slots, apply delta, diff directional refs
│  + Cards I/O      │  → card events
│                   │  → ServerMessage (Heartbeat, CardUpdate) → frontend
└─────────┬─────────┘
          │ card events
          ▼
┌───────────────────┐
│  Part B: Structure│  apply events → update cards + edges
│  + Propagation    │  SpawnRequest: accept (CardMaterialized) or reject (⊤+annotation)
│                   │  compile per card
└───────────────────┘
```

---

## Current State vs. Target

| Component             | Current                                                         | Target / Remaining                                      |
|-----------------------|------------------------------------------------------------------|---------------------------------------------------------|
| Part A (reducer)      | `apply_cards_delta_to_slot_map` + `card_slot_sync`               | Formalize explicit event objects for tracing/metrics    |
| Part A (I/O)          | `delta_to_server_messages` + push                                | Same; ensure CardUpdate reflects slot state             |
| Part B (structure)    | **Card API:** `add_card`, `remove_card`, `connect_cards`, `detach_cards` | ID-first API for Part A integration ergonomics          |
| Part B (propagation)  | **Card API:** `build_card`, CarriedCells, bi_sync wiring         | Same; build via `CardBuild` and connect-driven ensure    |
| Part B (spawn)        | *Not implemented*                                                | **TODO:** Card spawn API — accept SpawnRequest, materialize card from CardDesc |

---

## Implementation Notes

### Implemented in this iteration

- Added protocol command `CardBuild` (`CardBuildRequest`, `CardBuildResponse`) in `proto/lain.proto`.
- `connect_server.ts` now applies slot-map card events (diff + apply) on:
  - Session stream deltas
  - OpenSession initial slot map
  - PushDeltas unary updates
- Added `card_slot_sync.ts` to apply structural diffs:
  - card remove from observed slot keys
  - edge connect/detach from directional slot references
  - reciprocal directional refs are canonicalized to one logical connect
  - code slot updates into `internal_cell_this` (missing card is skipped + traced)
  - `::this` value changes emit internal `card_update` events (stable-signature compared)
- Added `cardBuild` route in Connect server and gRPC server.
- Added/updated tests:
  - `test/session_open_push.test.ts` for `to_card_build_data`
  - `test/connect_server.test.ts` for `CardBuild`

### Lifecycle contract (current)

- Backend builds cards in two scenarios:
  - explicit `CardBuild(card_id)` command from frontend,
  - `CardConnect` apply path (connect implies existence; endpoints are ensured).
- Backend does not auto-build from code-only deltas.
- Frontend-driven card value writes are applied via `card_update` -> `update_card` only.
- Backend applies `card_update` (`::this` value changes) only for existing runtime cards:
  - missing card case is skipped and exposed via debug tracing (`missing_card_for_update_card`).
- `PushDeltas` diff no longer emits unconditional `card_build` events.
- Runtime observer channel:
  - Part B emits `::this` updates via `emit_runtime_card_output_io`.
  - Part A processes outputs through MiniReactor stages and forwards as `CardUpdate(card_id, ::this, value)`.
  - Loop guard in Part A uses value dedupe against session state and outbox cache.

### Runtime output pipeline: propagation → frontend (no echo loop)

**Purpose:** When the propagation layer computes a new `::this` value for a card, it must be sent to the frontend as `CardUpdate`. We must avoid echoing values that originated from the frontend back to it (infinite loop).

**Where to call `emit_runtime_card_output_io`:** In the **propagation layer** — wherever a card's `::this` cell value changes. For example, when the `bi_sync` or compiled propagator writes to the `::this` cell, that write should trigger `emit_runtime_card_output_io({ cardId, slot: "::this", value })`. *(Hook point is currently in Part B; exact placement TBD in schema/runtime.)*

**Pipeline flow:**
1. Propagation updates cell → `emit_runtime_card_output_io` in `src/grpc/bridge/card_runtime_events.ts` (global source)
2. Bridge subscribes via `subscribe_runtime_card_output` in `src/grpc/connect_server.ts` (`attach_runtime_output_bridge_io`, lines 205–215)
3. Bridge pipeline in `src/grpc/bridge/connect_bridge_minireactor.ts` (`create_runtime_output_bridge_io`, lines 96–123):
   - `filter(not_equal_to_session_state)` — **loop guard:** if `state.slotMap[key]?.value` already equals the emitted value, skip (frontend sent it)
   - `filter(not_equal_to_outbox)` — temporal dedup: avoid sending same value twice in quick succession
   - `tap(forward_to_session_io)` — push `CardUpdate` to `session_push(state, ...)`
4. `open_session_yield_loop` in `src/grpc/connect_server.ts` (lines 185–203) yields from `state.queue` → streamed to frontend

**How the echo loop is avoided:**
- `state.slotMap` is updated when CardsDelta is applied (frontend input).
- If propagation produces the same value the frontend already sent, `state.slotMap[key]?.value` matches → `not_equal_to_session_state` returns false → event is dropped.
- Only values that differ from slotMap (i.e. computed by propagation, not echoed from frontend) are forwarded.

### Detach and disposal timing

`detach_cards` marks the connector for disposal; actual cleanup runs only when `execute_all_tasks_sequential` is invoked. Inside that call, **propagation runs first, then cleanup**. So if you detach and immediately trigger new propagation (e.g. via `update_source_cell`), the bi_sync child propagators are still active during that propagation step and will continue to push values across the detached link.

**Fix:** Run `execute_all_tasks_sequential` right after detach, before the next update. That ensures cleanup runs before any further propagation. See `card_api.test.ts` tests 1 and 6 for the pattern.

---

## References

- [CARDS-IMPLEMENTATION-PLAN.md](./CARDS-IMPLEMENTATION-PLAN.md) — Ontology, CardDesc, reducer rules, spawn, contradiction
- [card_api.ts](../src/grpc/card/card_api.ts) — Part B: build, add, remove, connect, detach
- [connect_server.ts](../src/grpc/connect_server.ts) — Session / OpenSession + PushDeltas handlers
- [card_runtime_events.ts](../src/grpc/bridge/card_runtime_events.ts) — Global source for `emit_runtime_card_output_io` / `subscribe_runtime_card_output`
- [connect_bridge_minireactor.ts](../src/grpc/bridge/connect_bridge_minireactor.ts) — MiniReactor pipeline: dedupe filters + `session_push(CardUpdate)`
