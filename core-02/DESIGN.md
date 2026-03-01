# core-02: Propagator Design Targets

A redesign of the propagator network system aimed at three main goals.

---

## 1. Dynamic Wiring

**Target:** Allow the propagator network to change its wiring at runtime—add/remove edges without reconstructing cells or propagators.

**Original limitation (Propogator):**
- Wiring is fixed at construction: `cell.addNeighbor(propagator)` and `propagator.getInputs()/getOutputs()` are set once.
- To "rewire," one must `removeNeighbor`, dispose, and reconstruct. No first-class add/remove of edges.

**Sketch approach (nodes.ts):**
- `GraphNode` is a pure structure: `{ id, inbounds[], outbounds[] }`.
- `add_inbound_edge`, `add_outbound_edge`, `remove_inbound_edge`, `remove_outbound_edge` mutate the graph.
- Wiring lives on the graph; nodes are referenced by identity. Edges can be added/removed without touching cell content or propagator logic.

---

## 2. Layered Architecture: Construction / Storage / Propagation

**Target:** Separate three concerns so that:
- **Construction layer** builds the graph and wiring.
- **Storage layer** holds cell content and strongest; can be swapped, garbage-collected, or persisted independently.
- **Propagation layer** runs the scheduler and merge logic; cells stay monotonic (content/strongest semantics unchanged).

**Original limitation (Propogator):**
- Cell fuses everything: content, strongest, neighbors, update logic, and alert semantics.
- Global `PublicState` holds all cells and propagators. No way to GC a subset without affecting the whole system.
- Disposal is intertwined with propagation (e.g., `removeNeighbor` triggers alerts).

**Sketch approach (core.ts):**
- `cell_store`, `propagator_store`: `Map<node_id, ...>` separate from the graph. Storage is keyed by node id.
- `cell_update_constructor(alert_propagators)`: propagation behavior is parameterized. The "how to alert" is injected, not global.
- Cells are identified by `GraphNode`; storage can be implemented by different backends (e.g., a module that GCs nodes not in a live set).

---

## 3. Propagator as Value

**Target:** Allow a propagator (or subnetwork) to be a value that can live inside a cell, so a cell can have an `internal_network` and participate in higher-order propagation patterns.

**Original limitation (Propogator):**
- Propagator is an object with `activate`, `dispose`, etc. It is not stored as cell content.
- `apply_subnet` works around this: a cell holds a *constructor* `(...cells) => Propagator`; the propagator is built and disposed based on that value. The propagator itself is not the value.

**Sketch approach (core.ts):**
- `compound_propagator(name, internal_network, inputs, outputs)`: propagator whose `content` is `internal_network: GraphNode[]`.
- The compound propagator *is* a graph node; its stored content is a subgraph. This makes "propagator as value" and "cell with internal network" the same concept at the representation level.

---

## Summary of Sketch Primitives

| Concept            | Original                          | Sketch (core-02)                         |
|--------------------|-----------------------------------|------------------------------------------|
| Node identity      | Cell/Propagator object            | `GraphNode` (id, inbounds, outbounds)    |
| Cell storage       | Inside Cell object                | `cell_store.get(node_id)`                |
| Propagator storage | Inside Propagator object          | `propagator_store.get(node_id)`          |
| Wiring             | `cell.addNeighbor(prop)`          | `add_inbound_edge`, `add_outbound_edge`  |
| Dynamic wiring     | Not supported                     | `remove_inbound_edge`, `remove_outbound_edge` |
| Propagation trigger| Global `alert_propagators`        | Injected `alert_propagators(node)`       |
| Propagator as value| Constructor in cell (apply_subnet)| `internal_network: GraphNode[]` in store |

---

## Open Questions for Discussion

1. **Alert semantics under dynamic wiring**  
   When an edge is removed, should we re-alert the affected propagators? When an edge is added, should we immediately run propagation from the new inputs? The sketch leaves this to the propagation layer.

2. **Compound propagator activation**  
   For `compound_propagator`, how does activation work? Does it recursively activate nodes in `internal_network`, or is there a separate interpreter that walks the subgraph? The current sketch has `get_propagator` but no `activate` wiring yet.

3. **GC and live sets**  
   If storage is separate, what defines "live"? The graph structure? An explicit root set? A tracer that follows `node_outbounds` from roots? This affects how we can GC cells in "other modules."

4. **Cell monotonicity vs. storage backends**  
   The merge/strongest semantics should stay the same. But if storage is pluggable (e.g., persistent, distributed), we need a clear interface: what does a storage backend need to implement for the propagation layer to work?

---

## Discussion: Achieving the Goals with the Current Sketch

### 1. Dynamic Wiring

**What the sketch already provides:**
- `GraphNode` is mutable; `add_*_edge` and `remove_*_edge` exist. The graph can change at any time.
- Storage is keyed by `node_id(node)`, so rewiring does not touch storage. A cell's content/strongest is independent of its edges.

**Gap:** The propagation engine must respect the *current* wiring when it runs. Right now `get_outbounds_propagators` uses `node_outbounds(node)`—so it will see updated edges. The key is that the propagation layer never caches wiring; it always reads from the graph. The sketch satisfies this.

**Consideration:** Bidirectional consistency. `add_inbound_edge(A, B)` updates both A.inbounds and B.outbounds. `remove_*` must do the same. The sketch does this. One subtlety: if we remove an edge while propagation is in flight, we need a clear rule. Option A: propagation uses a snapshot of the graph at alert time. Option B: propagation always reads live. Option B is simpler and matches the sketch.

---

### 2. Layered Architecture

**What the sketch already provides:**
- **Construction:** `create_node`, `create_cell`, `create_mono_directional_propagator`, `compound_propagator` build the graph and populate stores. No propagation happens at construction.
- **Storage:** `cell_store` and `propagator_store` are plain Maps. They could be replaced by an interface—e.g., `StorageBackend { get_cell(id), set_cell(id, data), get_propagator(id), ... }`—without changing the propagation logic.
- **Propagation:** `cell_update_constructor(alert_propagators)` receives `alert_propagators` as a parameter. The propagation layer does not hard-code where alerts go; it calls the injected function. So we can have different propagation strategies (e.g., different schedulers, different GC policies) by supplying different `alert_propagators`.

**Gap:** The propagation layer needs to *get* the outbound propagators to alert. Currently `get_outbounds_propagators` reads from the graph and the propagator store. For GC: if we want to "garbage collect cells in other modules," we need a way to say "this module's storage backend no longer holds node X." The propagation layer would need to handle "node not in store" gracefully—perhaps by treating it as no-op or by having the storage layer return a sentinel. The sketch throws on missing cells; we'd need a softer contract.

**Path to GC:** A separate module could:
1. Maintain its own `cell_store` / `propagator_store` (or a view over a shared one).
2. Define a live set (e.g., nodes reachable from some roots).
3. Periodically clear storage for nodes not in the live set.
4. The graph (nodes, edges) might still reference those node ids—but the storage layer would return "nothing" or a disposed marker. The propagation layer would need to tolerate that (e.g., skip alerting propagators whose inputs are all disposed).

---

### 3. Propagator as Value

**What the sketch already provides:**
- `compound_propagator` stores `internal_network: GraphNode[]` in the propagator store. The compound node *has* a value—the subgraph—and that value can, in principle, be read like any other cell content.
- The mental model: a cell could hold a `GraphNode[]` (or a single `GraphNode`) as its content. That would mean "this cell's value is a propagator network." The merge layer would need to know how to merge networks (or treat them as opaque values), but structurally it fits.

**Gap:** For a cell to truly *hold* a propagator-as-value:
- The cell's `content` / `strongest` would need to be able to represent a `GraphNode` or `GraphNode[]`. Right now `CellConstruct.content` is `any`, so we can store anything. The merge and strongest logic from `ppropogator` may not know how to handle it—we'd need a merge handler for "propagator" values.
- `apply_subnet` in the original: when the cell's value changes to a new constructor, we dispose the old subnet and build the new one. For "propagator as value," when the cell's value changes to a new subgraph, we'd need similar semantics: optionally dispose/teardown the old network, wire up the new one. That's an interpreter concern—something that watches cells containing networks and manages their lifecycle.

**Path forward:** 
- **Representation:** A cell can store `GraphNode[]` (or a handle to a network) as its strongest value. We add a merge handler: "propagator" values merge by replacement (newest wins) or by a custom policy.
- **Interpretation:** A higher-level layer (e.g., an "network interpreter" or "propagator runtime") subscribes to cells that may contain networks. When such a cell updates, it: (1) optionally disposes the previous network, (2) takes the new network from the cell, (3) wires it to the cell's inputs/outputs (or a standard interface) and runs it. This is analogous to `apply_subnet` but with networks as values instead of constructors.

---

## Summary: Sketch vs. Goals

| Goal              | Sketch support                        | Missing piece(s)                                      |
|-------------------|---------------------------------------|-------------------------------------------------------|
| Dynamic wiring    | ✅ Graph mutability, storage decoupled | Clear semantics for in-flight propagation             |
| Layered arch      | ✅ Construction / storage / propagation split | Storage interface, GC-friendly "missing node" handling |
| Propagator as value | ✅ compound_propagator stores network | Merge handler for network values, interpreter for lifecycle |

---

## Alternative: MiniReactor + Expression/Network Separation

### Proposal Overview

Instead of `nodes.ts` (GraphNode + cell_store + propagator_store), use **MiniReactor** as the runtime substrate and adopt the compiler's **expression/network separation**:

1. **Main network**: Cells and propagators in the main network still use **cell_store**—cells accumulate data (content, strongest) with full monotonic semantics. The main network behaves as before.
2. **Compound propagator** (and cells with internal networks) hold an **expression** (like `ClosureTemplate`: inputs, outputs, body AST)—not the compiled network.
3. **On activation**, the expression is compiled into a **compacted** MiniReactor subnetwork. The subnet only keeps the **interested network**—minimal structure needed for the computation, without retaining unnecessary intermediate cells/propagators.
4. **Storage split**: Main-network cells → cell_store (accumulated). Subnet (inside compound/cell) → compacted MiniReactor network, only what's needed.
5. **Hot-reload**: rewire by pointing a propagator to another input node—`disconnect(prop, old_source)` + `connect(prop, new_source)`.

### How It Fits the Design Goals

| Goal | Fit | Notes |
|------|-----|-------|
| **1. Dynamic wiring** | ✅ Strong | MiniReactor has `connect`, `disconnect`, `remove_edge`. Hot-reload = swap edge targets; propagator node stays, input wiring changes. No full rebuild. |
| **2. Layered architecture** | ✅ Strong | **Main network** = cell_store (accumulated). **Subnet** = compacted MiniReactor; expression layer holds AST/template; compiled subnet only keeps interested network; propagation via MiniReactor push. Separation is inherent. |
| **3. Propagator as value** | ✅ Strong | Compound holds *expression* as value. Network is compiled on activation and can be torn down. Analogous to `apply_closure` / `ClosureTemplate`: expression in cell, network built lazily. |

### Expression vs. Network (Compiler Analogy)

From `lain-lang/compiler`:

- **Expression**: `ClosureTemplate` = `{ env, name, inputs, outputs, body }` (body = unevaluated AST).
- **Network**: Built when `apply_closure` activates—`compile(body)(sub_env)` produces propagators, wired to external inputs/outputs.
- **Storage**: Cell holds the template; the runtime network is constructed per activation, then disposed.

For core-02 + MiniReactor:

- **Expression**: Propagator template = `{ inputs, outputs, body }` where body describes the subnetwork (AST, IR, or declarative spec).
- **Network**: Compiled into a **compacted** MiniReactor subnetwork on activation; only the interested network is kept (minimal nodes/edges); `dispose` tears it down.
- **Storage**: **Main network** keeps cell_store—cells accumulate. **Subnet** (compound/cell internal network) = compacted MiniReactor, no full cell accumulation inside.

### Hot-Reload Mechanism

"Point the designated propagator to another input node of MiniReactor":

```
disconnect(propagator_node, old_source_node)
connect(propagator_node, new_source_node)
```

The propagator node identity is preserved; only its parent edge changes. The MiniReactor graph supports this natively via `disconnect` / `connect`. For compound propagators, "hot-reload" could mean: recompile the expression (e.g. body changed), produce a new subgraph, and rewire the compound's outputs to the new subgraph's outputs—or swap which expression the compound is "pointing at."

### Trade-offs and Considerations

1. **Compilation cost**: Each compound activation compiles expression → network. Caching (memoize by expression hash) can amortize this, similar to `ce_apply_closure` / `calculate_closure_hash`.

2. **Propagator vs. MiniReactor semantics**: Propagator has merge/strongest/multiple-values-per-cell; MiniReactor is single-value push. A **bridge layer** is needed: cell = `stepper`-like node + merge logic in the edge callback; or a small adapter that translates "cell update" into "receive."

3. **Compaction**: The subnet (inside compound propagator or cell with internal network) is compiled into a compacted MiniReactor network—it only keeps the **interested network** (minimal structure, no unnecessary intermediate cells/propagators). The main network's cell_store still accumulates cell data; only the subnet is lightweight.

4. **Two representations**: Expression (for persistence, hot-reload, higher-order patterns) and network (for execution). The compiler already maintains this split; core-02 would mirror it with a different runtime (MiniReactor instead of Propogator's Cell/Propagator).

### Summary

| Aspect | nodes.ts sketch | MiniReactor + expression proposal |
|--------|-----------------|-----------------------------------|
| Runtime graph | GraphNode (id, inbounds, outbounds) | MiniReactor Node + Edge |
| Dynamic wiring | add/remove_edge on graph | connect/disconnect on MiniReactor |
| Compound content | internal_network (GraphNode[]) | expression (AST/template) |
| On compound activation | (undefined in sketch) | compile expression → MiniReactor network |
| Storage | cell_store, propagator_store | Main: cell_store (accumulated). Subnet: compacted MiniReactor (interested network only) |
| Hot-reload | Rewire via graph mutation | Point propagator to new input; or recompile expression |
| GC | Manual via store cleanup | MiniReactor `dispose` on subgraph |

---

## Evaluation: GC, Performance, Inspectability, Replayability

Comparison across: **Current Propogator**, **nodes.ts sketch (core-02)**, and **MiniReactor + expression proposal**.

---

### Garbage Collection

| Aspect | Current Propogator | nodes.ts sketch | MiniReactor + expression |
|--------|--------------------|-----------------|--------------------------|
| **GC mechanism** | Explicit: `mark_for_disposal(id)` → `cleanupDisposedItems()` after scheduler run. Removes from PublicState, disposes neighbors. | No built-in GC. Storage is `Map<node_id, ...>`; caller must delete entries. Live set is implicit (graph reachability). | **Main network**: Same as nodes.ts—explicit store cleanup. **Subnet**: MiniReactor `dispose(node)` cascades down (`have_only_one_parent_of`); reclaims nodes + edges from node_store/edge_store. |
| **Granularity** | Per cell/propagator by ID. Compound propagator's children are *not* auto-disposed when compound is disposed (noted in Propogator comments). | Per node_id. Can GC a whole module's storage if live set is known. | **Subnet**: `dispose(root)` reclaims entire downstream subgraph. **Main**: per-node or by module. |
| **Potential** | Medium. `disposeSubtree` exists but requires manual orchestration. Disposal triggers `NeighborType.disposing` alerts—propagation can run during teardown. | High. Storage is separate from graph; can define module boundaries, trace from roots, clear stores independently. No propagation during GC if graph is immutable during cleanup. | **High for subnet**: MiniReactor dispose is structural—follows parent→child, disconnects edges, removes from stores. Deterministic. **Main**: same as nodes.ts. |
| **Risk** | Disposal order matters; `removeNeighbor` triggers alerts; circular refs possible. | Orphaned graph nodes if store is cleared but graph still references them—propagation could throw. | Subnet: `have_only_one_parent_of` means nodes with multiple parents are *not* disposed (conservative). Main: same as nodes.ts. |

**Summary**: MiniReactor proposal gives the best GC story for **subnets**—structural dispose with clear semantics. Main network GC is similar to nodes.ts; both improve on current Propogator by separating storage and avoiding disposal-triggered propagation.

---

### Performance

| Aspect | Current Propogator | nodes.ts sketch | MiniReactor + expression |
|--------|--------------------|-----------------|--------------------------|
| **Propagation** | Scheduler queue + `alert_propagator` → `activate()`. Each cell update merges, tests content, alerts neighbors. | Same idea: `cell_update_constructor` merges, alerts; `get_outbounds_propagators` walks graph. | **Main**: Same as nodes.ts (cell_store, merge, alert). **Subnet**: MiniReactor push—`receive` → edge `activate` → child `receive`. Synchronous, no scheduler queue inside subnet. |
| **Memory** | Cell holds content + strongest + neighbors Map. Propagator holds inputs/outputs arrays + relation. All in objects. | Lighter: GraphNode is `{id, inbounds[], outbounds[]}`; storage in Maps. No neighbor Map per cell. | **Main**: Same as nodes.ts. **Subnet**: Only steppers + edges; no per-cell accumulation. Fewer allocations for intermediate values. |
| **Compound activation** | `compound_propagator`: builds full Propogator network on first activation; `to_build()` runs `compile(body)(env)`. Network persists. | Undefined. Would build graph + populate stores. | **Compilation cost** per activation (unless cached). **Compaction** = fewer nodes than naive expansion. Trade: compile cost vs. long-lived network. |
| **Hot path** | Cell update → merge → test_content → alert neighbors → scheduler enqueue → dequeue → activate. | Similar. | Main: same. Subnet: direct push, no scheduler. Subnet can be faster for simple pipelines. |

**Summary**: MiniReactor subnet avoids scheduler overhead for inner propagation—pure push. Compilation cost for compound can be amortized by caching. Main network performance is comparable across designs.

---

### Inspectability

| Aspect | Current Propogator | nodes.ts sketch | MiniReactor + expression |
|--------|--------------------|-----------------|--------------------------|
| **Cell state** | `cell.summarize()`: name, ID, strongest, content, neighbors. `cell.getContent()`, `cell.getStrongest()`. | `cell_content(node)`, `cell_strongest(node)`, `cell_name(node)` from store. No built-in `summarize`. | **Main**: Same as nodes.ts. **Subnet**: MiniReactor nodes have `id`; steppers have `get_value()`. No explicit "summarize" for nodes—would need adapter. |
| **Graph structure** | `cell.getNeighbors()`, `propagator.getInputs()`, `propagator.getOutputs()`. Relation tree via `get_children`. | `node_inbounds`, `node_outbounds`, `node_id`. Graph is first-class. | **Main**: nodes.ts-style if used. **Subnet**: `get_children`, `get_parents`, edge_store. MiniReactor has structure but different abstraction. |
| **Global view** | `cell_snapshot()`, `propagator_snapshot()` from PublicState. `observe_all_cells_update`, `observe_all_propagators_update`. | No global registry in sketch. Would need to enumerate graph + stores. | **Main**: Same as nodes.ts. **Subnet**: node_store, edge_store are global in MiniReactor—can enumerate. Subnet boundary may be unclear (which nodes belong to which compound). |
| **Expression vs. network** | Compound holds `to_build` (thunk). No separate expression value. | Compound holds `internal_network: GraphNode[]`—structure, not expression. | **Expression** is first-class. Can inspect expression (AST) without compiling. Compiled subnet is separate—can inspect both. |

**Summary**: Current Propogator has the richest inspectability (summarize, snapshots, observers). nodes.ts sketch has graph structure but no global registry. MiniReactor proposal adds expression-level inspection but subnet inspection requires mapping MiniReactor nodes back to logical structure; subnet boundaries need explicit tracking.

---

### Replayability

| Aspect | Current Propogator | nodes.ts sketch | MiniReactor + expression |
|--------|--------------------|-----------------|--------------------------|
| **Recording** | `record_propagators()` → `propagators_alerted` holds executed propagators in order. `replay_propagators(logger)` iterates them. | No recording in sketch. Would need scheduler to capture alerted nodes. | **Main**: Same as nodes.ts if scheduler records. **Subnet**: MiniReactor has no scheduler—push is immediate. No natural "replay" of subnet execution order. |
| **Frame format** | `PropagatorFrame`: step_number, inputs (CellFrame: strongest, content, reference), outputs, propagator. `describe_propagator_frame` for human-readable output. | No frame type. Would need to define one (node, inputs, outputs, content at step). | **Main**: Can adopt PropagatorFrame if main network uses scheduler. **Subnet**: Push order is implicit (topological); no explicit "steps." Replay would be "re-run with same inputs" rather than step-by-step. |
| **Replay semantics** | Replay = log of what ran. Does not re-execute; just reports. To truly replay, would need to re-apply updates and re-run scheduler. | Same gap. | Subnet: could "replay" by re-sending values through the same MiniReactor graph—deterministic if graph is pure. Main: same as current. |
| **Value capture** | `CellFrame` captures `strongest`, `content` at propagation time. Full cell state. | Would need to capture `cell_content`, `cell_strongest` at alert time. | Main: same. Subnet: stepper `get_value()` at any moment; no historical content/strongest. Subnet replay = re-push inputs, observe outputs. |

**Summary**: Current Propogator has the best replay story—`record_propagators`, `PropagatorFrame` with cell state, `describe_propagator_frame`. nodes.ts sketch and MiniReactor proposal both need equivalent machinery for the main network. For the **subnet**, MiniReactor push model has no step concept; "replay" becomes re-execution with same inputs, not a step-by-step trace. To get parity, would need to instrument edges to log (parent_id, child_id, value, timestamp) and reconstruct a trace.

---

### Cross-Cutting Summary

| Dimension | Current Propogator | nodes.ts | MiniReactor + expression |
|-----------|--------------------|----------|--------------------------|
| **GC** | Explicit, disposal-triggered propagation | Storage separable, manual | Subnet: structural dispose ✅. Main: manual |
| **Performance** | Scheduler + object overhead | Similar | Subnet: push, no scheduler ✅ |
| **Inspectability** | summarize, snapshots, observers ✅ | Graph + store, no global | Expression inspectable ✅; subnet needs mapping |
| **Replayability** | record + PropagatorFrame ✅ | Not implemented | Main: needs same; subnet: re-execute only |

**Recommendations for MiniReactor proposal**:
1. **Replay**: Add a record layer for main-network propagation (like `record_propagators`); for subnet, either instrument MiniReactor edges to log events or accept "re-execute for replay."
2. **Inspectability**: Define subnet boundaries (which MiniReactor nodes belong to which compound) and expose a `summarize`-like API for main + subnet.
3. **GC**: Use MiniReactor `dispose` for subnet teardown; for main network, adopt the nodes.ts storage pattern (explicit live set, store cleanup) to enable module-scoped GC.

---

## Hot-Reload and Incremental Compilation

Comparison including the incremental compiler (`incremental_compiler.ts`) and related mechanisms.

---

### Current Design: Hot-Reload Mechanisms

| Mechanism | Trigger | Behavior | Scope |
|-----------|---------|----------|-------|
| **apply_subnet** | Cell holding constructor changes (`cell_strongest(subnet)`) | `dispose` old subnet → `l_apply_propagator` new constructor → `forward` inputs. Full swap. | Single compound: subnet cell + inputs/outputs |
| **incremental_apply_closure** | `closure` or `env` cell updates | Compound propagator re-runs; `ce_apply_closure` builds new unfolded network from template. Closure = `ClosureTemplate` (inputs, outputs, body AST). | Whole closure application |
| **merge_closure_incremental** | Layered datum merge (vector clock) | Hash-based: `source_template_inconsistent(closure, inputs, outputs)` → if same hash: **dispatch only** (forward inputs, no recompile). If different: dispose old, unfold new. | Granular: avoid recompile when only input *values* changed |
| **dynamic_propagator** | Constructor cell changes | Similar to apply_subnet: snapshot inputs, apply new constructor, copy outputs, dispose. | Delayed propagator application |

**Incremental compilation** (`incremental_compile`):

- Signature: `(expr) => (env, source_cell, timestamp)`
- `source_cell` + `timestamp` identify edit origin (vector clock / premises).
- `(network name ...)` expression → `update_cell(closure_cell, construct_layered_datum(closure, vector_clock_layer, ...))`
- Reactivity: closure cell update → dependent propagators re-run → `incremental_apply_closure` re-compiles.
- `load_compiler_parameters(incremental_compile, source, timestamp)` bakes source/timestamp into the compile function for edit-tracking.

**Summary**: Hot-reload is **value-driven** (cell holds expression/constructor; change propagates). Incremental compilation uses **hash + vector clock** to avoid full recompile when only inputs changed; recompile only when template (closure body, I/O structure) changes.

---

### nodes.ts Sketch: Hot-Reload Potential

| Aspect | Status | Notes |
|--------|--------|-------|
| **Wiring swap** | ✅ Direct | `remove_*_edge` + `add_*_edge`; graph mutates. Storage unchanged. |
| **Value-driven swap** | Needs wiring | No `apply_subnet`-style helper. Would need: cell holds expression → compound watches cell → on change, rewire or rebuild. |
| **Incremental compile** | Not present | No hash store, no merge_closure_incremental. Would need to port expression + hash + merge logic. |
| **Edit-scoped recompile** | Not present | No source_cell/timestamp. Would need a separate edit-tracking layer. |

---

### MiniReactor + Expression Proposal: Hot-Reload Potential

| Aspect | Status | Notes |
|--------|--------|-------|
| **Wiring swap** | ✅ Native | `disconnect(prop, old_source)` + `connect(prop, new_source)`. Propagator node identity preserved. |
| **Value-driven swap** | ✅ Natural fit | Compound holds **expression**; on activation, compile → MiniReactor subnet. Expression change → next activation uses new expression → new subnet. Dispose old subnet when expression changes. Same pattern as `apply_subnet` but with expression instead of constructor. |
| **Incremental compile** | Portable | Hash expression (body, inputs, outputs); if hash unchanged, **reuse** compiled subnet, only rewire inputs. Equivalent to `merge_closure_incremental`'s "consistent template" path. |
| **Edit-scoped recompile** | Needs adapter | `source_cell`/timestamp live in the compiler/env layer. Main network cells + expression layer can carry vector clock; need to thread it into "when to recompile" decision. |
| **Partial recompile** | Possible | Subnet = compiled subgraph. Can `dispose` a subtree and recompile only that part if expression supports it (e.g. sub-expression changed). MiniReactor `dispose` is structural—reclaim a branch. |

---

### Comparison Summary

| Dimension | Current Propogator + incremental_compile | nodes.ts sketch | MiniReactor + expression |
|-----------|------------------------------------------|-----------------|--------------------------|
| **Hot-reload trigger** | Cell value change (constructor, closure) | Manual graph mutation | Cell value change or explicit rewire |
| **Swap mechanism** | dispose + rebuild (apply_subnet, ce_apply_closure) | Graph edge add/remove | disconnect + connect (rewire) or dispose + compile (value change) |
| **Incremental (avoid recompile)** | Hash + vector clock; dispatch only when template unchanged | Not implemented | Hash expression; reuse subnet when unchanged ✅ |
| **Edit-scoped recompile** | source_cell, timestamp, vector clock | Not implemented | Needs adapter for main/expression layer |
| **Partial recompile** | Whole closure at a time | N/A | Structural dispose of subnet branch; recompile that branch |
| **Wiring change cost** | Full dispose + rebuild | O(1) edge ops | O(1) disconnect + connect |

---

### Incremental Compilation: Portability to MiniReactor Proposal

The incremental compiler's key pieces:

1. **Expression as value**: ClosureTemplate / network expression in a cell. ✅ MiniReactor proposal has this.
2. **Reactive recompile**: Compound watches expression cell; when it changes, recompile. ✅ Same pattern.
3. **Hash-based caching**: `calculate_closure_hash`, `source_template_inconsistent`. ✅ Can hash expression (AST or IR); skip recompile when hash unchanged.
4. **Merge logic**: `merge_closure_incremental`—nothing vs. unfold, inconsistent vs. dispose+unfold, consistent vs. dispatch. ✅ MiniReactor: "consistent" = reuse subnet + rewire inputs (or re-push). "Inconsistent" = dispose subnet + compile new.
5. **Edit tracking**: source_cell, timestamp, vector clock, `generic_prove_staled_by`. Lives in the **merge layer** (layered datum, PremisesSource). For MiniReactor, this stays in the main network's cell/merge semantics; the subnet doesn't need it—only the decision "recompile or not" at the boundary.

**Verdict**: Incremental compilation can be ported to the MiniReactor proposal. Expression + hash + merge logic map cleanly. Edit-scoped recompile (vector clock) stays in the main network; the compound propagator's activation logic consults it before deciding reuse vs. recompile. The main advantage: **rewiring** is O(1) with `disconnect`/`connect`, so "consistent template, new input source" can be a simple rewire instead of full rebuild.
