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

**Location:** `connect_server.ts` (route wiring), `card_slot_sync.ts` (diff + apply events), `session/` (session state and combinator).

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
   - **CardAdd:** `add_card(id)` — create card, add to storage; returns card id (string) for piping.
   - **CardRemove:** `remove_card(id)` — detach incident connectors, dispose card.
   - **CardConnect:** `connect_cards(idA, idB, slotA, slotB)` — add bi_sync connector; takes card IDs only (no Cell). Returns `Either<void, string>` (Left on missing card).
   - **CardDetach:** `detach_cards(idA, idB)` — dispose connector, remove from storage; takes card IDs only.
   - **SpawnRequest(A, dir, CardDesc):** *Not yet implemented.* TODO: materialize new card from CardDesc when direction is unoccupied.
   - **BuildCard(cardId):** `build_card(env)(id)` — compile existing card (CarriedCells, internal network); returns card id (string). Card must already exist (via add_card).
3. **Build propagation graph:**
   - Build CarriedCell per card (::this, ::left, ::right, ::above, ::below) — `p_construct_card_cell`, `unfold_card_internal_network`.
   - Wire `bi_sync` per adjacency via `card_connector_constructor_cell` (slot cells ↔ neighbor ::this).
   - Compile per card via `compile_card_internal_code` (incremental compiler).
4. **Emit runtime output events (observer hook):**
   - Part B emits card runtime updates (`card_id`, `::this`, `value`) via `emit_runtime_card_output_io`.
   - The session layer forwards these to frontend `CardUpdate` via `sessions_push` (broadcast to all session queues).

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
  - `sessions_push` (from session combinator) forwards each event as `CardUpdate` to all active session queues.
  - Each OpenSession stream yields from its session queue.

### Session layer (combinator architecture)

Session-related logic is centralized in the session layer so `connect_server` only wires routes.

**Primitives:**
- `session_store.ts` — `get_all_sessions`, `get_or_create_session`, `session_push`, `wait_for_message_or_timeout`, `remove_session`
- `session_push_constructor.ts` — `(get_sessions) => (event) => void` — forwards runtime events to all session queues
- `connect_session_helpers.ts` — pure helpers: `delta_to_server_messages`, `open_session_initial_slot_map`

**Combinator:**
- `session_combinator.ts` — `create_session_combinator(env)` returns:
  - `sessions_push` — `session_push_constructor(get_all_sessions)`
  - `init` — calls `init_runtime_card_output_io(sessions_push)` to wire Part B output → session queues
  - `openSession` — handler: setup, yield loop (drain queue or heartbeat), cleanup on close

**Wire-up in `connect_server.ts`:**
```ts
const session = create_session_combinator(env)
session.init()
// ...
openSession: (req, ctx) => session.openSession(req, ctx)
```

### Runtime output pipeline: propagation → frontend

**Purpose:** When the propagation layer computes a new `::this` value for a card, it must be sent to the frontend as `CardUpdate`.

**Where to call `emit_runtime_card_output_io`:** In the **propagation layer** — wherever a card's `::this` cell value changes (e.g. when `bi_sync` or compiled propagator writes to `::this`).

**Pipeline flow:**
1. Propagation updates cell → `emit_runtime_card_output_io` in `src/grpc/bridge/card_runtime_events.ts`
2. `init_runtime_card_output_io(sessions_push)` is called at Connect server startup (from `session.init()`)
3. `sessions_push` = `session_push_constructor(get_all_sessions)` — for each event, pushes `CardUpdate` to every session queue via `session_push(state, msg)`
4. `open_session_yield_loop` in `session_combinator.ts` yields from `state.queue` → streamed to frontend

### OpenSession logging (DEBUG_GRPC=1)

- **Backend** logs when messages are pushed to the session queue and when they are yielded to the client:
  - `[grpc] OpenSession queue push` — `sessionId`, summary of each message (heartbeat / cardUpdate key set|remove)
  - `[grpc] OpenSession yield to client` — `sessionId`, summary of the message sent
- **Frontend:** when consuming the OpenSession stream, log each received `ServerMessage` to compare with backend. Example (pseudocode):
  - For each message: `console.log("[OpenSession] received", msg.kind?.case, msg.kind?.case === "cardUpdate" ? { cardId: msg.kind.value?.cardId, slot: msg.kind.value?.slot, ref: msg.kind.value?.ref } : null)`

**Echo loop avoidance:** `state.slotMap` is updated when CardsDelta is applied (frontend input). Deduplication of echoed values may be handled in the propagation layer or frontend; the session layer broadcasts all emitted events to session queues.

### Detach and disposal timing

`detach_cards` marks the connector for disposal; actual cleanup runs only when `execute_all_tasks_sequential` is invoked. Inside that call, **propagation runs first, then cleanup**. So if you detach and immediately trigger new propagation (e.g. via `update_source_cell`), the bi_sync child propagators are still active during that propagation step and will continue to push values across the detached link.

**Fix:** Run `execute_all_tasks_sequential` right after detach, before the next update. That ensures cleanup runs before any further propagation. See `card_api.test.ts` tests 1 and 6 for the pattern.

---

## References

- [CARDS-IMPLEMENTATION-PLAN.md](./CARDS-IMPLEMENTATION-PLAN.md) — Ontology, CardDesc, reducer rules, spawn, contradiction
- [card_api.ts](../src/grpc/card/card_api.ts) — Part B: build, add, remove, connect, detach
- [connect_server.ts](../src/grpc/connect_server.ts) — Route wiring; Compile, NetworkStream, Session, OpenSession, PushDeltas, CardBuild
- [session_combinator.ts](../src/grpc/session/session_combinator.ts) — Session combinator: `sessions_push`, `init`, `openSession` from session store
- [session_store.ts](../src/grpc/session/session_store.ts) — Session state, `get_all_sessions`, `session_push`, `wait_for_message_or_timeout`
- [session_push_constructor.ts](../src/grpc/session/session_push_constructor.ts) — `(get_sessions) => (event) => void` — forward runtime events to all sessions
- [card_runtime_events.ts](../src/grpc/bridge/card_runtime_events.ts) — `init_runtime_card_output_io`, `emit_runtime_card_output_io`
