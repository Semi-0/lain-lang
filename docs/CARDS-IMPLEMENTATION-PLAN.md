# Cards Implementation Plan (lain-lang)

**Status:** DRAFT  
**Aligned with:** [lain-viz design-principles.md](../lain-viz/docs/design-principles.md)

---

## Implementation Focus

We are focusing on finishing this strongest demo:

1. **A card system** — Cards with six cells (`code`, `::this`, directional ports)
2. **Directional linking via `::this`** — Adjacency wiring with `::this` as hub
3. **Spawn via CardDesc** — Ports watched for `CardDesc(code_string)`; materialize on unoccupied
4. **Occupied → contradiction** — Lattice ⊤ at port; annotation channel; even minimal UI for contradiction state
5. **Projection as structure-derived layout** — Layout computed from adjacency graph (no stored grid coords)

---

## 1. Ontology

Two coupled layers:

| Layer | Concern |
|-------|---------|
| **Runtime layer** | Propagator network; values and computation over cells. |
| **Structural layer** | Card topology; identity and adjacency between cards. |

They are not the same. **Layout is a projection over structure and value annotations.** Grid coordinates are not semantic truth. **Adjacency is.**

---

## 2. Card Runtime Structure

Each card owns six cells:

- `code` (string)
- `::this`
- `::left`
- `::right`
- `::above`
- `::below`

- **`::this`** is the card's primary computed boundary value.
- **Directional ports** (`::left`, `::right`, `::above`, `::below`) are membranes for neighbor interaction and structural requests.

### Universal adjacency wiring (::this as hub)

If A is left of B:
```
bi_sync(A::right, B::this)
bi_sync(B::this, A::left)
```

Same pattern for other directions. **Directional ports never sync directly to each other** without passing through `::this`.

| Adjacency   | Wiring |
|-------------|--------|
| A left of B | `bi_sync(A::right, B::this)`, `bi_sync(B::this, A::left)` |
| A above B   | `bi_sync(A::below, B::this)`, `bi_sync(B::this, A::above)` |
| A right of B| `bi_sync(A::left, B::this)`, `bi_sync(B::this, A::right)` |
| A below B   | `bi_sync(A::above, B::this)`, `bi_sync(B::this, A::below)` |

---

## 3. Content and Structural Values

- **`code`** is plain string and is what the compiler consumes.
- **CardDesc** is a **distinct structural value type** (not "just any string") whose payload is a code string:

  ```
  CardDesc(code_string)
  ```

  Card-as-value is structural; its content is textual code. This keeps early iteration easy while semantics stay unambiguous.

---

## 4. Localized Compilation

Each card compiles its `code` using a local environment that binds:

- `::this`
- `::left`
- `::right`
- `::above`
- `::below`

**Compiler is unaware of structure, spawning, layout.** It only builds propagators over these cells.

### Global env export (filtered)

Network expressions defined inside a card can be exported into a global env (filtered), so other cards can call them. Example (see `lain-lang/test/compiler.test.ts`):

```
(network add1 (>:: x) (::> y) (+ x 1 y))
(add1 5 out)
```

**Rule:** This export is **not** used to infer adjacency wiring.

---

## 5. Structural Layer (Topology Truth)

Structural truth is stored as cards + symmetric directed edges:

- **cards:** `{ card_id, code_string }`
- **edges:** `{ from_card_id, direction, to_card_id }` with enforced symmetry

**No absolute grid positions.** Layout/projection is computed from the adjacency graph plus value-level visualization annotations.

---

## 6. CardsDelta and Reducer-Derived Connect/Detach

Server receives CardsDelta as slot updates (including directional slots carrying card-id refs).

We maintain previous slot state, apply delta, and **diff to infer connect/detach events**, but only for directional structural reference slots.

**Rules:**

| Previous | Next | Meaning |
|----------|------|---------|
| `nil` → `CardIdRef(B)` | Connect A-dir to B |
| `CardIdRef(B)` → `nil` | Detach A-dir from B |
| `CardIdRef(B)` → `CardIdRef(C)` | Detach, then connect |

**Ordering law** inside one reducer tick:
1. Apply all detaches
2. Apply all connects/spawns
3. Enforce symmetry

---

## 7. Symmetry Enforcement

Edges are symmetric. If `A.right = B` then `B.left = A`.

Implemented via a dedicated propagator/reducer that enforces the inverse slot update.

**If conflicting refs prevent symmetry**, raise contradiction at the structural ref slot level—do **not** silently overwrite by clock.

---

## 8. Spawn Semantics (Structural Values Through Ports)

Directional ports are **watched** for structural values of type **CardDesc**.

If a port cell receives `CardDesc(code_string)`:

- **If the direction is unoccupied:**
  - **Materialize:** create a new card entity with `code = code_string`
  - Add symmetric edges between origin and new card
  - Compile the new card
  - (Optional later) support recursive spawn by letting CardDesc carry neighbors; currently omitted since CardDesc is minimal

- **If the direction is occupied:**
  - Do **not** mutate edges
  - Enter **contradiction state** on that boundary

Spawn is **deterministic and transactional**.

---

## 9. Occupied Neighbor Policy (Lattice + Annotations)

The cell lattice:

- **⊥** (Nothing) — bottom
- **ordinary values**
- **⊤** (Contradiction) — top

Strongest selection uses vector clock dominance, but **⊤ dominates all**.

**Occupied-spawn handling** is implemented as:

1. **Lattice channel:** set the port's state to ⊤ (Contradiction)
2. **Annotation channel:** store the attempted descriptor and any explanation data in parallel

So the port can be in contradiction while still retaining:
- attempted CardDesc (or its payload hash) + vector clock
- occupant identity (from structural layer) + clock snapshot if useful

**Existing neighbor remains intact and continues working**, because wiring is derived from **structural edges**, not from the port's strongest lattice value.

This guarantees: **no silent replacement**, even if the attempted spawn has a newer clock.

**Resolution** is explicit and user-triggered:
- Replace neighbor (apply immutable graph transform)
- Unplug existing neighbor (detach edge)
- Cancel spawn (clear attempted candidate)
- Spawn into layer (future)

---

## 10. Equality and Idempotency

CardDesc equality is handled by the propagator system policy. Practically it must be **stable** so the same CardDesc does not retrigger spawns repeatedly.

Store a session-level **"last materialized fingerprint"** per `(origin card, direction)` as an additional guard if needed.

---

## 11. Detach Lifecycle

Detaching removes the linking propagators (bi_sync connections) and updates edges/structural ref slots.

**The detached card remains in the scene (orphaned)** unless explicitly deleted.

---

## 12. Visualization / Projection Annotations

Values may carry annotations naming a visualization schema. The cell does **not** know how to render; it only names what renderer applies. The view layer maps schema tags to renderers and maintains interaction state separately (unless later you choose to compute interaction).

---

## 13. Invariants

These must always hold:

1. Every card has exactly one `::this`.
2. Directional edges are symmetric.
3. Runtime wiring reflects structural edges.
4. **CardDesc never contains runtime cell identity.**
5. **Compiler is unaware of the structural layer.**

---

## 14. What's Intentionally Left Open

- **Recursive CardDesc neighbors** (spawn chains/grids) can be introduced later by extending CardDesc beyond minimal payload; the current plan supports it without changing fundamentals.
- **CardRef/handles** for non-tree topology can be added later.
- **Layer dimension** for collision resolution is a future extension; current occupied policy shows contradiction and waits for user resolution.

---

## 15. Data Flow: connect_server → Compiler

```
CardsDelta (slots, remove)
       │
       ▼
Reducer: diff directional refs, apply detach → connect/spawn → symmetry
       │
       ▼
bind_context_slots_io(env, slotMap)   ← currently stub
       │
       ▼
[Per card:]
  1. Build / update CarriedCell for card (::this, ::above, ::below, ::left, ::right)
  2. Connect ::this → incremental_compiler (localized env)
  3. On connect: bi_sync(A::right, B::this), bi_sync(B::this, A::left)
  4. On spawn (CardDesc in port, unoccupied): materialize, add edges, compile
  5. On occupied spawn: set port to ⊤, store annotation; existing neighbor intact
  6. On detach: remove bi_sync, update edges; card becomes orphan
       │
       ▼
Yield CardUpdate(s) to frontend
```

---

## 16. References

- `lain-viz/docs/design-principles.md` — Contextual sensing, layout, layers
- `lain-viz/TODO` — Card lifecycle, local env, CarriedCell mapping
- `Propogator/DataTypes/CarriedCell` — `merge_carried_map`, `make_map_carrier`, `ce_struct`, etc.
- `lain-lang/compiler/incremental_compiler.ts` — Compilation entry
- `lain-lang/src/grpc/compile_handler.ts` — `bind_context_slots_io` stub
- `lain-lang/src/grpc/session_encode.ts` — `key_to_card_and_slot` for slot naming
- `lain-lang/test/compiler.test.ts` — network expression examples: `(network add1 (>:: x) (::> y) (+ x 1 y))`, `(add1 5 out)`
