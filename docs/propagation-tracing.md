# Propagation graph tracing (compiler + card API)

This document describes how to make the propagator graph behind the compiler and the card/gRPC stack **analyzable** via `compiler/tracer/generalized_tracer.ts`: choosing what to trace (abstraction layer / namespace), naming, and attaching metadata on the exported graph.

## Goals

- **Layer 1:** Trace a **designated abstraction layer** (relation level) or adjust that filter **dynamically**, instead of mixing all propagators into one undifferentiated walk.
- **Layer 2:** Keep a **cohesive picture** of **compiler-related** cells, **card API / runtime** cells, and **bridging** propagators—and make that visible when building the trace graph.
- **Observability:** **Meaningful names** and **structured metadata** on each traced node (and optionally edges) for tools (Vega, REPL, tests, debug UI).

---

## Layer 1 — Abstraction level (relation depth)

### What the tests encode

In `Propogator/test/abstraction_level.test.ts`, each cell and propagator is tied to a `Primitive_Relation` with a numeric **`get_level()`** derived from the parent chain (`make_relation` → `parent.get_level() + 1`). That value is **nesting depth** in the relation tree, not by itself “compiler vs card.”

### What the tracer does today

In `compiler/tracer/generalized_tracer.ts`:

- **`trace_upstream`** — walks **all** dependents (no level filter).
- **`trace_upstream_primitive` / `trace_upstream_primitive_layer`** — use  
  `compose(get_dependents, curried_filter(at_primitives))`.

In `Propogator/Shared/Generics.ts`, **`at_primitives` is `generic_at_level(5)`**: only items whose **relation** is **exactly level 5** participate in the filtered walk. That is a **fixed** slice.

**Naming pitfall:** `Propogator/DataTypes/Relation.ts` also exports `relation_at_primitives` as **level 1**. The name “primitives” is overloaded: **level 5** in `Generics.ts` vs **level 1** in `Relation.ts` are different predicates.

### Recommended directions

1. **Parameterize the layer** — e.g. `trace_upstream_at_level(level: number)` or a predicate on `get_relation(x).get_level()`.
2. **Dynamic adjustment** — expose the same predicate (or `walk_nodes` function) as configuration when constructing the tracer.
3. **Separate “level” from “subsystem”** — numeric level answers “how deep in the relation tree.” To separate compiler vs card, add **explicit naming**, **dedicated `parameterize_parent` scopes**, or **tags** (see Layer 2), not only level numbers.

---

## Layer 2 — Namespaces: compiler vs card vs bridges

### Existing structure

- **Compiler:** cells and propagators created during compilation (`compiler/compiler.ts`, env, closures, etc.).
- **Card API:** `src/grpc/card/card_api.ts` re-exports; the graph is built in **`card_lifecycle.ts`**, **`runtime.ts`**, **`schema.ts`**, etc.

### Making subsystems visible to analysis

| Approach | Role |
|----------|------|
| **Naming convention** | Prefix `construct_cell` / `construct_propagator` names: e.g. `compiler:…`, `card:…`, `connector:…` — works with current `create_label` (`cell_name` / `propagator_name`). |
| **Relation scopes** | Use **`parameterize_parent(make_relation("compiler" \| "card" \| …))`** so depth and names align with intentional boundaries (same pattern as abstraction-level tests). |
| **Roots / entry points** | Card code already uses maps (e.g. in `runtime.ts`). Use those as **trace roots** to limit exploration to one card id or one pipeline. |

### “Loading namespace in the tracer”

Practically: pass **explicit roots** (root cell + gather cell) per concern, and/or **filter `walk_nodes`** using `get_relation` plus optional tags—not only a global fixed level (such as 5).

---

## Naming and metadata on traced nodes

### Current behavior

`graph_step` in `generalized_tracer.ts` sets each Graphology node to `{ label: create_label(item) }` (from `cell_name` / `propagator_name`).

### Options

1. **Instrument the compiler / runtime** — richer `name` arguments to `construct_propagator` / `construct_cell` where names are still opaque.
2. **Enrich in the tracer** — derive display strings and fields from `get_relation(item)` (`get_name()`, `get_level()`, ids) in addition to `create_label`.
3. **Structured fields** — store **`kind`** (`cell` \| `propagator`), **`relationLevel`**, **`relationName`**, **`namespace`**, etc., alongside `label`.

---

## Graphology: “arbitrary per-node attributes are first class”

**What “first class” means here**

In Graphology, each **node** (and each **edge**) is stored with a plain **attributes object**—a bag of key–value pairs you define. The library does **not** force a single reserved shape (e.g. only `label`). You are not maintaining a separate “metadata table” keyed by node id unless you choose to.

So:

- **Arbitrary** — You can add keys such as `label`, `kind`, `relationLevel`, `namespace`, `source`, `cardId`, … as needed for your tools.
- **First class** — Those fields live on the graph node itself; `mergeNode(nodeId, attributes)` merges/sets them, and `getNodeAttributes(nodeId)` (and related APIs) read them uniformly. They are not a second-class add-on bolted beside the graph.

**Caveat:** Whatever you put in attributes should be **JSON-serializable** if you export the graph to JSON (common for Vega or debugging).

### Typing (TypeScript)

You can parameterize the graph type with node/edge attribute interfaces, e.g. `DirectedGraph<NodeAttrs, EdgeAttrs>`, so your metadata is type-checked at compile time.

---

## Suggested implementation order (foundations)

1. **Disambiguate naming** — align or rename `at_primitives` / `relation_at_primitives` so “primitive layer” is unambiguous (or introduce `at_relation_level(n)`).
2. **Generalize `trace`** — configurable `walk_nodes` or a small options object (level predicate, optional namespace predicate).
3. **Enrich `graph_step`** — merge structured attributes next to `label`.
4. **Optional** — deeper hooks in compiler/card only where names remain insufficient after (2)–(3).

---

## Planned approach: question-first tracers + combinators

The more efficient path is **not** to build one giant generic tracer first and hope it answers every question. Instead:

1. **Pick concrete questions** we need answered (see [Query catalog](#query-catalog) below).
2. For each (or each family), implement a **small, specific tracer** (or graph builder) with a clear contract.
3. **Expose it from the language** by registering primitives in **`compiler/primitive/stdlib.ts`** (same pattern as existing `graph:dependents`, `graph:prim-dependents`, `graph:card`, `graph:nodes`, …), so REPL and programs can invoke them.
4. **Unit-test** each tracer against known small graphs (fixtures or minimal card/compiler setups) so we know it works before layering more features.

This matches how `stdlib.ts` already wires `trace_upstream`, `trace_upstream_primitive`, and `compiler/tracer/graph_queries.ts` primitives: **stdlib is the public surface**; **tracer modules** hold the logic.

### Combinators: graph queries vs propagator-level composition

**Today:** `generalized_tracer.ts` is mostly **functional** structure: `traverse`, `graph_step`, `cyclic_prevention_*`, and `trace(walk_nodes)` that materializes a Graphology graph into a gatherer cell.

**Next step:** add **combinators** in `generalized_tracer.ts` (and small helpers) that are useful for *both*:

- **Pure graph phase** — filter, map, rewrite, or join Graphology graphs (e.g. “drop accessor edges”, “only primitive propagators”, “subgraph induced by card id”).
- **Propagator phase** — small **propagator constructors** that take cells + config and output derived views (graphs, summaries, or cell snapshots) so queries can be **composed in the propagator network** itself: upstream/downstream of a “query” cell, reactive refresh when the underlying graph changes, etc.

The distinction matters: **functional combinators** return data; **propagator combinators** are **live** and participate in scheduling. Many “inspect” questions need the latter for REPL/card UI; batch analysis can stay functional.

Design sketch (to be refined in code):

| Combinator style | Use when |
|------------------|----------|
| `walk_nodes` filters + `graph_step` variants | Building one static snapshot |
| Graph transforms (`subgraph`, `contract_edges`, `annotate_nodes`) | Post-process snapshot for a specific question |
| `p_trace_*` / `p_graph_*` primitives | User-facing composition and reactive pipelines |

---

## Query catalog

These are the **questions we care about**, in rough priority order. Each row is a planning stub: exact API names, filters, and tests TBD.

### 1. All network related to a card

**Question:** Given a card id (or root cell), what is the full **propagator subgraph**—internal cells, connectors, compile sources, neighbor slots—everything that participates in that card’s runtime?

**Direction:** Roots from **`card_metadata` / `runtime.ts`** (or the card’s root cell) plus controlled walks (`get_dependents` / `get_downstream` or both) with **namespace or name prefix** filters. May reuse or extend **`p_graph_card`** and related **`graph_queries`** primitives.

**Tests:** Extend or mirror `test/card_api.test.ts` topology helpers; assert node counts or presence of known propagator names.

---

### 2. Primitive propagation graph *without* call graph (direct links)

**Question:** The **dataflow** among **primitive propagators** only, but the runtime also has **call graph** structure linked through **accessors** (environment lookups, indirections). For analysis we want a view where accessor indirection is **replaced by direct edges** between the primitive propagators (or their I/O cells) that “would” connect if calls were inlined.

**Direction:** This is a **graph rewrite**, not a raw `trace_upstream`:

- Either **walk** the real graph and emit a **derived** graph with different edge rules, or
- **Collapse** paths through designated “accessor” nodes/propagators into single edges.

Requires a precise definition of “accessor” in this codebase (lexical lookup cells, `p_sync` chains, etc.). Likely two phases: export raw graph → **transform** with combinators.

**Tests:** Minimal graph: two primitives with an accessor chain between them; assert the transformed graph has a **direct** edge and no accessor node (or accessor marked excluded).

---

### 3. Call graph of primitive functions

**Question:** The **call / dependency** structure between **primitive functions** (apply chain, who calls whom), as opposed to the **value** propagation graph.

**Direction:** May use **relation parent/child**, **generic parent-child** links on propagators, or explicit naming—whatever the compiler records today. If the only links are via accessors, this ties closely to (2) but keeps **call** semantics (invocation order / static structure) rather than dataflow.

**Tests:** Small env with nested primitive application; snapshot expected call edges.

---

### 4. Card upstream and downstream graphs

**Question:** For a card (or slot cell), what is **upstream** (what feeds it) and **downstream** (what it feeds), possibly as **two** graphs or one labeled directed graph.

**Direction:** `trace_upstream` vs `trace_downstream` from `generalized_tracer.ts`, rooted at card boundary cells (e.g. `internal_cell_this`, slot cells), plus filters so we do not pull the entire compiler. Combine with card id filters from (1).

**Tests:** Two connected cards; assert upstream of B includes A’s outputs; downstream of A includes B’s inputs.

---

### 5. Display values of cells (inspect card)

**Question:** When inspecting a card in the UI, show **current strongest / displayed values** for selected cells in the traced subgraph—not only topology.

**Direction:** Not Graphology-only: attach **`cell_strongest` / `inspect_strongest`** (or layered inspect) into node attributes **at snapshot time**, or a **parallel** map `cellId → value summary`. Watch payload size and serialization. May be a **propagator** that refreshes when the gatherer graph updates.

**Tests:** Set known values on cells; run tracer; assert attributes or exported JSON contain expected summaries.

---

### 6. Inspect *content* of a cell in the graph of interest

**Question:** Deeper than (5): not just “display value” but **structured cell content** (layers, premises, contradictions) for nodes we mark as interesting.

**Direction:** Use **`inspect_content`** / existing cell introspection from `ppropogator`; optional **opt-in** flag per query so we do not dump full content for every node. May be a separate primitive `graph:inspect-deep` or an argument to a combined inspect propagator.

**Tests:** Fixture cell with layered or non-trivial content; assert truncated or full content in output matches expectation.

---

## Systematic workflow (summary)

| Step | Action |
|------|--------|
| 1 | State the question (one row above). |
| 2 | Decide: **snapshot** (functional) vs **reactive** (propagator). |
| 3 | Implement tracer + any **graph combinator** in `generalized_tracer.ts` or `tracer/graph_queries.ts`. |
| 4 | Register in **`compiler/primitive/stdlib.ts`** with a clear primitive name. |
| 5 | **Unit test** in `test/` with a minimal graph. |
| 6 | Only then generalize if multiple questions share the same core transform. |

---

## Related files

| Area | Path |
|------|------|
| Tracer (walk + graph materialization) | `compiler/tracer/generalized_tracer.ts` |
| Graph query primitives (card, prefix, nodes, …) | `compiler/tracer/graph_queries.ts` |
| **Primitive registration / user-facing names** | `compiler/primitive/stdlib.ts` |
| Legacy / alternate tracers | `compiler/tracer/tracer.ts` |
| Level filter helpers | `Propogator/Shared/Generics.ts` (`generic_at_level`, `at_primitives`) |
| Relation / level | `Propogator/DataTypes/Relation.ts` |
| Abstraction tests | `Propogator/test/abstraction_level.test.ts` |
| Compiler entry | `compiler/compiler.ts` |
| Card API surface | `src/grpc/card/card_api.ts` |
| Card runtime graph | `src/grpc/card/runtime.ts`, `schema.ts`, `card_lifecycle.ts` |
| Card topology tests | `test/card_api.test.ts` |
