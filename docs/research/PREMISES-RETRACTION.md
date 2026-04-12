# Premises, retraction, and the cost of global belief updates

This note records how **ppropogator** (in `Propogator/`) carries **MIT / SDF-style** ideas about **premises** and **support sets**, why the first TypeScript encoding stayed **implicit and expensive**, how later designs (**PatchedValueSet**, **PremisesSource**, **TemporaryValueSet**) tried to align premises with **vector clocks** and **cell-local merge**, and which problems remain open. It ties directly to [higher-order propagation](./HIGHER-ORDER-PROPAGATOR.md) (incremental graphs, alternative hypotheses) and to search-style code (`p_amb`, nogoods) and layered reasoning (e.g. Datalog-as-propagator).

Paths below are relative to the **eko-workspace** tree (`Propogator/`, `lain-lang/`).

---

## 1. SDF lineage: `ValueSet` and filtering by premise

In the Scheme lineage, **values in a cell** can carry **support** (which premises justify them). The TypeScript `ValueSet` layer filters contributions before merging:

```132:141:Propogator/DataTypes/ValueSet.ts
export function strongest_consequence<A>(set: any): A {
    return pipe(
        set,
        (elements) => filter(elements, compose(get_support_layer_value, is_premises_in)),
        (filtered) => reduce(
            filtered,
            merge_layered,
            the_nothing,
        )
    );
}
```

So **retraction** at the *data* level means: a premise flips to “out,” support sets no longer satisfy `is_premises_in`, and that contribution **drops out of the merge**. The propagator graph does not need to know every consumer by name if merge and support are wired consistently.

The **global premise registry** (`is_premise_in` / `mark_premise_in` / `mark_premise_out`) is still the authority those predicates consult.

---

## 2. Global store: `Premises.ts` + `PremiseMetaData` — implicit, detached, expensive

`Premises.ts` holds a single **map** of named `PremiseMetaData` (MiniReactor-backed `Stepper`). Registering a premise attaches **roots** (opaque handles the metadata can “wake”).

On **belief change**, `PremiseMetaData.wake_up_roots` does **not** precisely notify only dependents; it escalates to **global** scheduler commands:

```67:71:Propogator/DataTypes/PremiseMetaData.ts
    wake_up_roots(){
        // Targeted testContent via CellValueStore premise_index (clock-channel premises only;
        // see Propogator/docs/TODO-PREMISE-INDEX-SUPPORT-LAYER.md). Then alert ambs for search.
        set_global_state(PublicStateCommand.WAKE_CELLS_FOR_PREMISE, this.name);
    }
```

The handler in `PublicState.ts` resolves each indexed `cellId` in `all_cells`, calls `testContent()`, then alerts all amb propagators. `FORCE_UPDATE_ALL_CELLS` is **not** used on this path (the command remains available for manual/debug use).

**Consequences (updated for Stage 3):**

- **Clock-channel** premise dependencies are reflected in `CellValueStore.premise_index`; wake is **targeted** to those cells. **Support-layer-only** premise tags are still not indexed — see `Propogator/docs/TODO-PREMISE-INDEX-SUPPORT-LAYER.md`.
- The **premises store** (named beliefs) is still somewhat **implicit** relative to the graph for paths that do not carry clock channels; those cells may still need a global refresh or a future support-layer index.
- That matches the TODO in `Premises.ts` (“maybe using a map could making altering quicker”): **queries** like `is_premises` are also marked **quite slow** in code comments — the design favors a simple global map over incremental indexing.
- **Retraction** for indexed cells is **narrower** than `FORCE_UPDATE_ALL_CELLS`, but the global premise map and `is_premises` checks can still be **slow**; a full TMS-style justification graph is not implemented yet.

This is still why [higher-order propagator work](./HIGHER-ORDER-PROPAGATOR.md) treats **“premise retraction as the elegant HO story”** as only **partially** realized: support-layer gaps and search/Datalog integration remain.

---

## 3. `PatchedValueSet.ts` — patch-based sets (legacy)

`PatchedValueSet` explored **explicit join/remove patches** on value sets (still using `strongest_consequence` / subsumption from `ValueSet`). The file is now marked **deprecated** in its header: prefer **`ValueSet`** and the **temporary value set** path for new work.

It documents an intermediate intuition: treat updates as **structural edits** to a set of layered values rather than only as “new merge into cell.” It did not by itself solve **global** premise wake-up.

---

## 4. Treating **vector-clock sources** as premises: `PremisesSource.ts`

`PremisesSource.ts` ties **source identity** to **premise names** and registers a **source cell** with the global premise store:

```47:51:Propogator/DataTypes/PremisesSource.ts
const register_source_cell = (cell: Cell<any>) => {
    const premises = cell_id(cell);
    register_premise(premises, cell);
    dependents_cells.set(premises, cell);
    dependents_cells.set(cell_name(cell), cell);
}
```

**Idea:** the **channel** in a vector clock (often the source id) **is** the premise name; forwarding clocks and reactive updates keep provenance explicit in the value, not only in a separate support layer.

**Operational hooks** such as `kick_out` / `bring_in` wrap `mark_premise_out` / `mark_premise_in` and then **`forwarding_source_clock`** on the source cell so timestamps move and dependents can see a **new** layered value even when the base payload is unchanged — a partial answer to “how do we **re**-assert after retract?”

**Open issues called out in code:**

- Premise in/out **cannot be tracked remotely** — only in the **local** environment (`PremisesSource.ts` comments around the `dependents_cells` / broadcast discussion).
- **`p_connect_to_source` / `p_sync_back_without_source`** are specialized propagators: they encode clock forwarding rules that **ordinary** cells do not share. That clashes with the broader design goal that **cells infer role from local merge + neighbors**; here, **premise-aware** behavior leaks into **ad hoc** primitives.
- **`kick_out_cell` / broadcast** paths are partly **commented or unfinished** (`emit_broad_cast_message`, incomplete `kick_out_cell`), which is a sign the “resurrect downstream after full retract” story is not closed.

**Retract-from-everywhere / bring-back tension (your question):**  
If a source’s contribution **fully disappears** from downstream cells (merged away, garbage-collected from temporary sets, or never re-emitted), then **flipping the premise back to “in”** is not enough unless **something** re-injects or re-derives the value. `bring_in` + `forwarding_source_clock` helps when the **source cell** still holds (or can re-hold) content and the network **still has** propagators from that source to outputs. If the graph or merge **removed** the last copy of the justification, you need either **persistent hypotheses** (nogoods / amb worlds), **replay** from a root cell, or **explicit dependency edges** from premise → consumers — the current global wake is a **hammer** substitute for that.

---

## 5. `TemporaryValueSet.ts` — clock-carrying sets and merge-side “weaker when out”

`TemporaryValueSet` installs handlers so **temporary value sets** merge with **vector-clock-aware** adjoin, and **strongest** uses a dedicated reducer `tvs_strongest_consequence` that **prefers** a value whose clock channels are **premise-in** over one that is **premise-out** when both are present:

```136:160:Propogator/DataTypes/TemporaryValueSet.ts
// when value is retracted they do not disappear
// but they went weaker
export const tvs_strongest_consequence = (content: TemporaryValueSet<any>) => reduce(
    content,
    (a: LayeredObject<any>, b: LayeredObject<any>) => {
        ...
        else if (tvs_is_premises_in(a) && tvs_is_premises_out(b)) {
            return a;
        }
        else if (tvs_is_premises_in(b) && tvs_is_premises_out(a)) {
            return b;
        }
        else {
            return partial_merge(a, b);
        }
    },
    the_nothing
)
```

So retraction can mean **weakening** inside the cell’s merged content instead of deleting the subgraph. That interacts with the **HO** question: **incremental** networks still need a clear story for **which** alternatives live in the set and **when** stale entries are removed (`vector_clock_prove_staled_by` / `value_set_adjoin` logic).

---

## 6. Why retraction still matters for lain-lang

### Search and contradiction (`Search.ts`)

`binary_amb` and related code **choose** among hypotheses using **premise in/out** and **nogoods** (`premises_nogoods`, `mark_premise_in` / `mark_premise_out`). A TODO in `binary_amb` notes dependence on **support** being visible first. **Global** wake-up is trying to approximate “re-run just enough of the graph to settle amb after a nogood change” — without a **fine-grained** dependency map, that remains fragile and costly.

### Datalog and additive facts (`DatalogPropagator.ts`)

The Datalog wrapper uses **additive** `FactSet` merge so cells do not “contradict” on union; **retraction** of a *hypothesis* or *world* is **not** the same as removing a fact unless you add **tombstones**, **versioning**, or **premise-scoped** fact sets. Any serious **search over theories** (multiple minimal models, tabling + nogoods) will need the same **premise / support** story as the propagator core, or Datalog stays “monotonic world only.”

### Higher-order propagation

As in [HIGHER-ORDER-PROPAGATOR.md](./HIGHER-ORDER-PROPAGATOR.md), a **clean** story is often: **build** under premise *A*, **retract** *A* and **believe** *B* to switch networks without dynamic constructor swapping. That requires **cheap, correct** retraction — which this codebase does not yet fully provide.

---

## 7. Sketch: “root cell broadcasts retractions” — benefit and cost

**Idea:** a **root** (or session) cell holds the active **premise set** and **broadcasts** retract/activate events so only cells that **depend** on those premises update.

**Problem:** If the root must **discover** dependents by scanning **all** cells each epoch, complexity approaches **O(network)** per change — same order as `FORCE_UPDATE_ALL_CELLS`, unless you maintain **inverse indices** (premise → {cells, propagators}) incrementally when edges are added.

**What would need to be true for a solution:**

- **Explicit** or **derivable** registration: when a value with support / clock channel *P* is merged into a cell, record *P* → cell (and when propagators install, record *P* → propagator if needed).
- **Local wake:** `wake_up_roots` becomes “notify this **better set** of handles,” not “alert everything.”
- **Resurrection:** when a premise returns **in**, either **source cells** re-emit (current `bring_in` direction) or **justifications** are **stored** until explicitly stale (TMS / truth maintenance).

---

## 8. Summary table

| Piece | Role | Pain |
|--------|------|------|
| `ValueSet.ts` | Merge set filtered by support / `is_premises_in` | Still relies on global premise predicates |
| `Premises.ts` + `PremiseMetaData` | Named beliefs, roots | **Global** wake; store somewhat **detached** from graph |
| `PatchedValueSet.ts` | Patch algebra on sets | **Deprecated**; not the long-term path |
| `PremisesSource.ts` | Source id ↔ premise; clock forwarding; kick/bring | **Special** propagators; remote / broadcast **unfinished** |
| `TemporaryValueSet.ts` | Clock-carrying sets; merge + strongest prefers “in” | Stale-element GC and full **bring-back** story still design work |

---

## 9. Next steps (to explore together)

Concrete directions that **do not** require scanning all cells every time:

1. **Premise → dependent index** maintained when `generic_merge` / cell content sees a new support or clock channel (hook or wrapper).
2. **Justification logs** per cell (minimal TMS): on retract, remove justifications tagged with *P*; on assert, re-derive from retained premises.
3. **Session / world id** as a layer on **FactSet** (Datalog) so retraction deletes or masks a **world**, not individual merge cells blindly.
4. **Staged scheduler**: premise change enqueues only **marked** propagators (requires (1)).

This document is intentionally **descriptive + problem framing**; implementation choices should be validated against `test/advanceReactive.test.ts`, amb/search tests, and any future HO compile tests.
