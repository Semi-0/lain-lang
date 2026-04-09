# Higher-order propagators (design note)

This document records how **lain-lang** and **ppropogator** try to compile and run **higher-order** behavior: values in cells that *mean* “build or choose a piece of network,” not only atomic data. It is written for anyone working on **lain-viz** who needs the backend/compiler mental model; the code lives mostly under `lain-lang/` and `Propogator/`.

## The core tension

A **first-order** propagator has fixed neighbors: inputs and outputs are known when the relation is installed.

A **higher-order** step is different: the *shape* of the network (or which propagator runs) can depend on **partial information** that arrives later or changes reactively—for example a **closure template** plus operands, or a cell carrying a constructor `(...cells) => Propagator`.

Two kinds of partial information often move on different schedules:

1. **The “recipe”** (closure, template, or constructor).
2. **The arguments** (operand cells, environment, or entry values).

If you **collapse** the inner network straight into the outer propagator’s boundary without careful ordering guarantees, you get **timing races**: a value can reach an “entry” cell **before** the graph that should consume it has been switched or fully wired. The experimental `dynamic_propagator` path encodes that failure mode explicitly (see below).

## Naive delayed constructor: `dynamic_propagator`

`lain-lang/compiler/dynamic_propagator.ts` implements a **delayed** propagator: it snapshots inputs, applies a constructor cell to build a fresh propagator, activates it, copies outputs, then disposes inner cells and the inner propagator.

The file’s own comment flags the problem:

- When the constructed piece is a **compound** propagator, **“it has timing issue”**—there is no general guarantee that activation and registration happen **before** downstream propagation against the outer boundary’s cells has settled.

So this approach is kept as a **negative experiment / sketch**, not as the supported HO story.

## Carried-cell patterns (structural HO)

`Propogator/DataTypes/CarriedCell/HigherOrder.ts` shows **structural** higher-order style at the map/list layer: zipping carried maps, combining lists, and **`carrier_map`**, which diffs an input map and, for new keys, calls a closure `(...args) => Propagator` to attach sub-networks keyed by those entries.

That pattern is useful when the “function” is **keyed expansion** of a map of cells, but it does not by itself solve the **closure-as-compiler-template** problem that lain-lang faces (lexical environment, incremental recompile, vector clocks, etc.).

## Compiler closure pipeline (current direction)

### Barrel and templates

- `lain-lang/compiler/closure.ts` re-exports closure and primitive application (`./closure/base`, `./closure/unfold`, `./closure/application`, primitive modules). **`ClosureTemplate`** and unfold machinery live there.

### Incremental compiler

- `lain-lang/compiler/incremental_compiler.ts` treats compilation as **reactive**: `incremental_apply_propagator` switches on whether the operator cell is a **closure** or **primitive**, and passes a **parameterized** `incremental_compile` (via `load_compiler_parameters`) so nested compilation sees the same source/timestamp context.

### Applying a closure without losing the timing story

- `lain-lang/compiler/closure/application.ts` defines:
  - **`apply_closure`**: classic compile inside a fresh `ce_dict` sub-environment (batch style).
  - **`incremental_apply_closure`**: a `compound_propagator` over `[closure, env]` that, when values are usable, builds **input/output cell vectors** from the template and operands, then calls **`ce_apply_closure`** from `lain-lang/compiler/closure/unfold.ts`.

The incremental path is the intentional place where **both**:

- the **inner unfolded network** (template + compile), and  
- the **operand / env cells**  

are treated as **partial information** that must stay consistent across updates—rather than swapping a whole sub-network in one fragile step inside a single primitive activation.

`unfold.ts` contains explicit notes that **separate closure updates vs. cell updates** would introduce timing problems; the design pushes complexity toward **unfolded closure** objects that can be updated in a controlled way (see `InternalUnfoldedClosure`, `UnfoldedClosure`, `ApplyClosureTemplate` and related predicates).

**Status (author’s assessment):** `incremental_apply_closure` plus `incremental_compiler` are **heavy**—they are the current compromise, not a final minimal HO mechanism.

## Alternative sketch: symlink / observer-carried network

`lain-lang/compiler/closure/apply_closure_symlink.ts` is an incomplete sketch: it would **extend** the environment with scoped cells and wire **symlink-style** indirection.

`Propogator/DataTypes/ObserverCarriedCell.ts` implements **links** (`create_observer_link`, `p_sync_to_link`, etc.): a propagator can hold a **symbolic reference** to another cell and forward updates through resolution.

**Risk:** the same class of **ordering** problems can appear if values flow to resolved targets **before** the link or the backing network is the one you intend. So this path is promising for **sharing** structure without copying, but it is **not** a free fix for HO timing without additional invariants (staging, premises, or explicit scheduling contracts).

## Premises, retraction, and a possible “MIT-style” endgame

The propagator literature (including SICP-adjacent **propagator** work) often talks about **hypotheticals** and **premises**: build several possible networks or facts, then **retract** a premise to drop an entire alternative.

In this repo, `Propogator/DataTypes/Premises.ts` and `PremiseMetaData` implement that idea: premises are registered with **roots**, and toggling belief runs **global wake-ups** (`ALERT_ALL_AMBS`, `FORCE_UPDATE_ALL_CELLS` in `wake_up_roots`). There is even a TODO suggesting a map could make altering quicker; `is_premises` is noted as **quite slow**.

**Hypothesis (not attributed as historical fact):** a **clean** HO story might be: **build** propagators once under premise `P₁`, then **retract** `P₁` and **believe** `P₂` so the old subgraph stops contributing—without dynamically swapping constructors inside one primitive. That would align with “all graphs exist; control visibility by premises.”

**Why it is not the default here yet:** retraction and global updates are **expensive** in the current implementation and would need a **more efficient** premise store and more localized invalidation before this beats the incremental unfold path for interactive compilation.

## Summary table

| Approach | Where | Main issue / role |
|----------|--------|-------------------|
| Delayed constructor + snapshot | `lain-lang/compiler/dynamic_propagator.ts` | Timing vs. compound inner propagators |
| Map-keyed subnetworks | `Propogator/DataTypes/CarriedCell/HigherOrder.ts` | Good for carried maps; not whole compiler HO |
| Incremental unfold + parameterized compile | `closure/application.ts`, `closure/unfold.ts`, `incremental_compiler.ts` | Heavy; treats network + inputs as partial info |
| Observer / symlink | `ObserverCarriedCell.ts`, `apply_closure_symlink.ts` | Indirection; still needs ordering discipline |
| Premise retraction | `Premises.ts`, `PremiseMetaData.ts` | Conceptually attractive; current retraction is costly |

## Open direction

A plausible long-term direction is **premise-scoped networks with cheaper retraction** (incremental, local wake-up, better indexing), so higher-order behavior is expressed as **which premise is active** rather than as **hot-swapping** constructors inside a single propagator step. Until then, the **incremental unfold** stack remains the working plan, with known weight and complexity.
