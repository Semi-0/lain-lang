# Backend Architecture (As-Built)

**Status:** Current runtime architecture for the Connect backend used by `lain-viz`.  
**Scope:** `src/grpc/connect_server.ts`, session layer, slot sync, card runtime APIs.

---

## TL;DR

The browser client uses **three RPCs only**:

- `OpenSession` (server stream, outbound updates/heartbeat)
- `PushDeltas` (unary, inbound slot-map deltas)
- `CardBuild` (unary, explicit compile/build trigger)

`Compile`, `NetworkStream`, and bidi `Session` exist in proto as **deprecated** and are stubbed in route wiring for the current browser path.

---

## Runtime Topology

```text
Frontend (lain-viz)
  ├─ OpenSession(session_id, initial_data) ───────────────┐
  ├─ PushDeltas(session_id, CardsDelta) ─────────────────┐│
  └─ CardBuild(session_id, card_id) ───────────────────┐ ││
                                                        │ ││
                                                        v vv
                ┌──────────────────────────────────────────────────────┐
                │ connect_server.ts                                    │
                │  - create_session_combinator(env).init()            │
                │  - route wiring: openSession / pushDeltas / cardBuild│
                └──────────────┬───────────────────────────────────────┘
                               │
                               v
        ┌──────────────────────────────────────────────────────────────┐
        │ Slot map transition + event derivation                       │
        │  apply_cards_delta_to_slot_map(prev, delta) -> next          │
        │  diff_slot_maps_to_card_api_events(prev, next) -> events     │
        │  apply_card_api_events_io(env, events)                       │
        └──────────────┬───────────────────────────────────────────────┘
                       │
                       v
        ┌──────────────────────────────────────────────────────────────┐
        │ Card runtime / propagation                                   │
        │  add_card / remove_card / connect_cards / detach_cards       │
        │  update_card / build_card                                    │
        │  emits RuntimeCardOutputEvent(::this) via bridge             │
        └──────────────┬───────────────────────────────────────────────┘
                       │
                       v
        ┌──────────────────────────────────────────────────────────────┐
        │ Session fan-out                                              │
        │  session_push_constructor(get_all_sessions)                  │
        │  queue ServerMessage(CardUpdate|Heartbeat) per session       │
        │  openSession stream drains queue + heartbeats                │
        └──────────────────────────────────────────────────────────────┘
```

---

## Connect Routes (Current)

In `create_connect_routes(env)`:

- **Active**
  - `openSession` → `session.openSession(req, ctx)`
  - `pushDeltas` → `push_deltas_apply_io(req, env)`
  - `cardBuild` → `card_build_apply_io(req, env)`

- **Inactive for browser path**
  - `compile` / `networkStream` / bidi `session` are stubbed in route wiring.
  - Their legacy handlers remain in file for restore/debug, but are not bound.

Proto (`proto/lain.proto`) marks these legacy RPCs as deprecated.

---

## Data Model & Ownership

### Session-owned

- `SessionState.slotMap` (current canonical slot-map for a session)
- `SessionState.queue` (pending outbound `ServerMessage`s)

From `session_store.ts`:
- `get_or_create_session`, `get_session`, `remove_session`
- `session_push`, `wait_for_message_or_timeout`, `get_all_sessions`

### Card-runtime-owned

- Card graph/cells/propagators and connector lifecycle
- Compile/build behavior per card

From `src/grpc/card/card_api.ts` and internals:
- `add_card`, `remove_card`, `connect_cards`, `detach_cards_by_key`
- `update_card`, `build_card`

---

## PushDeltas Pipeline

`push_deltas_apply_io` performs:

1. Decode request (`to_push_deltas_data`)
2. Resolve/create session (`get_session` or `get_or_create_session`)
3. Compute transition:
   - `nextSlotMap = apply_cards_delta_to_slot_map(prevSlotMap, delta)`
   - `events = diff_slot_maps_to_card_api_events(prevSlotMap, nextSlotMap)`
4. Apply events to runtime:
   - `apply_card_api_events_io(env, events)`
5. Persist `state.slotMap = nextSlotMap`
6. Trace outcome (events + apply issues)

Key point: this path is **state transition + side-effect apply**, not direct one-off mutators.

---

## OpenSession Pipeline

`create_session_combinator(env)` centralizes open-session behavior:

- `init()` wires runtime output bridge:
  - `init_runtime_card_output_io(sessions_push)`
- `openSession(req, ctx)`:
  1. Decode open payload (`sessionId`, optional `initialData`)
  2. Create/get session with initial slot map
  3. If initial slots exist:
     - diff `{}` -> `initialSlotMap`
     - apply via `apply_card_api_events_io`
     - call `bind_context_slots_io` (currently no-op stub)
  4. Yield one immediate heartbeat
  5. Loop:
     - wait for queue or timeout
     - drain queued messages, else emit heartbeat
  6. Cleanup on stream end: `remove_session(sessionId)`

---

## CardBuild Pipeline

`card_build_apply_io`:

1. Decode `{sessionId, cardId}`
2. Validate card id; validate session existence when `sessionId` provided
3. Load code from session slot-map key `${cardId}code`
4. If code is string: `update_card(cardId, code)`
5. Execute `build_card(env)(cardId)`
6. Return `CardBuildResponse { success, error_message }`

This keeps **build explicit** and tied to current slot-map code.

---

## Slot Sync Rules (Current)

`diff_slot_maps_to_card_api_events(prev, next)` in `delta/card_slot_sync.ts`:

- Detects structural edges from directional slots (`::left/right/above/below`) and canonicalizes reciprocal refs.
- Emits events:
  - `card_detach`
  - `card_remove`
  - `card_add`
  - `card_connect`
  - `card_update` (currently from `code` slot sync path)

`apply_card_api_events_io` maps each event to card API calls.

Note: issues array exists in `CardApiApplyReport`, but current implementation mostly applies directly and returns empty unless custom issue collection is added.

---

## Runtime Output to Frontend

Bridge: `src/grpc/bridge/card_runtime_events.ts`

- Runtime emits `RuntimeCardOutputEvent { cardId, slot: "::this", value }`
- `emit_runtime_card_output_io(event)` forwards to:
  - configured `sessions_push` callback (if initialized)
  - local subscribers

Fan-out: `session_push_constructor(get_all_sessions)`

- Converts runtime event -> `ServerMessage.CardUpdate`
- Pushes to every session queue via `session_push`
- `openSession` streams those queued messages to connected frontend clients

---

## Deprecated / Legacy Paths

Still present in code but not used by browser route wiring:

- unary `Compile`
- server-stream `NetworkStream`
- bidi `Session`

Also, `compile_for_viz` and `bind_context_slots_io` in `handlers/compile_handler.ts` are legacy/stub-oriented for the deprecated unary compile path; `bind_context_slots_io` remains called in open/push setup but is currently a no-op.

---

## Operational Notes

- `pushDeltas` can create a session if missing (`get_or_create_session`) and logs that path.
- `openSession` removes session state when stream closes.
- Detach/cleanup semantics in propagation may require scheduler flush ordering; see `docs/CARD-COMPILE-NEIGHBOR-BUG.md` and `test/card_api.test.ts` for lifecycle edge cases.

---

## References

- `src/grpc/connect_server.ts` — route wiring + push/build pipelines
- `src/grpc/session/session_combinator.ts` — open-session lifecycle and bridge init
- `src/grpc/session/session_store.ts` — session state and queue primitives
- `src/grpc/session/session_push_constructor.ts` — runtime event fan-out to sessions
- `src/grpc/delta/card_slot_sync.ts` — slot-map diff -> card events -> card API apply
- `src/grpc/card/card_api.ts` — card runtime API surface
- `src/grpc/bridge/card_runtime_events.ts` — runtime output bridge
- `proto/lain.proto` — RPC surface and deprecations
