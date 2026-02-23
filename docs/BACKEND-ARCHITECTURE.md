# Backend Architecture: Two-Part Separation

**Status:** DRAFT  
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

**Location:** Lives in/alongside `connect_server.ts` — the reducer logic that processes CardsDelta and yields both events and ServerMessage.

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

**Output:**
- Updated propagation network (cells, propagators).
- No direct I/O to frontend; Part A handles that.

**Implementation (Part B):** `src/grpc/card/` — `card_api.ts` (unified API), `storage.ts` (add/remove/connect/detach), `schema.ts` (card structure, slots, connectors). `bind_context_slots_io` in `compile_handler.ts` is still a stub; it does not yet wire slot-map updates to the Card API.

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
| Part A (reducer)      | `apply_cards_delta_to_slot_map` only                             | Diff directional refs, emit card events                 |
| Part A (I/O)          | `delta_to_server_messages` + push                                | Same; ensure CardUpdate reflects slot state             |
| Part B (structure)    | **Card API:** `add_card`, `remove_card`, `connect_cards`, `detach_cards` | Wire `bind_context_slots_io` to Card API from slot-map  |
| Part B (propagation)  | **Card API:** `build_card`, CarriedCells, bi_sync wiring         | Same; BuildCard works via `build_card(env)(id)`         |
| Part B (spawn)        | *Not implemented*                                                | **TODO:** Card spawn API — accept SpawnRequest, materialize card from CardDesc |

---

## Implementation Notes

### Detach and disposal timing

`detach_cards` marks the connector for disposal; actual cleanup runs only when `execute_all_tasks_sequential` is invoked. Inside that call, **propagation runs first, then cleanup**. So if you detach and immediately trigger new propagation (e.g. via `update_source_cell`), the bi_sync child propagators are still active during that propagation step and will continue to push values across the detached link.

**Fix:** Run `execute_all_tasks_sequential` right after detach, before the next update. That ensures cleanup runs before any further propagation. See `card_api.test.ts` tests 1 and 6 for the pattern.

---

## References

- [CARDS-IMPLEMENTATION-PLAN.md](./CARDS-IMPLEMENTATION-PLAN.md) — Ontology, CardDesc, reducer rules, spawn, contradiction
- [card_api.ts](../src/grpc/card/card_api.ts) — Part B: build, add, remove, connect, detach
- [connect_server.ts](../src/grpc/connect_server.ts) — Session / OpenSession + PushDeltas handlers
