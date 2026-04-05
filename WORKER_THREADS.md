# Worker Threads for Lain Compiler / Networks (Feasibility Notes)

This note evaluates the feasibility of using `worker_threads` to offload Lain compilation and/or heavy propagator-network computation.

## What is safe/easy today: one compiler per worker (isolation)

`lain-lang/compiler/incremental_compiler.ts` (and `ppropogator`) rely on **process-global runtime state**:

- scheduler selection via `set_scheduler(...)`
- global cleanup/state via `set_global_state(PublicStateCommand.CLEAN_UP)`
- merge handler installation via `set_merge(...)`
- various registries / installed handlers

Because of these globals, running multiple independent compiler runtimes **in the same JS thread** is likely to interfere.

However, **worker threads give you isolation**, because each worker has its own module instance and its own globals. This makes the following architecture straightforward:

- **Main thread**: acts as a coordinator; sends `(code, timestamp, options)` to workers.
- **Worker thread**: calls compiler `init_system()`, creates a fresh `primitive_env(...)`, compiles/evaluates, drains the scheduler, and returns a **serializable summary**.

### What we implemented

- `lain-lang/compiler/worker/compiler_worker.ts`
  - a `worker_threads` entrypoint that initializes the incremental compiler runtime once, compiles code on request, drains tasks, and posts back a `{ ok, result_summary }` response.
- `lain-lang/compiler/worker/worker_threads.test.ts`
  - Bun tests that spawn multiple workers concurrently and verify:
    - same program yields the same normalized summary
    - different programs can be compiled concurrently

### How to run the test

```bash
bun test lain-lang/compiler/worker/worker_threads.test.ts
```

## What is *not* solved by “independent compiler per worker”

This approach does **not** run one compound propagator network *across* threads.

Each worker builds its own in-memory cells/propagators. Those objects are not transferable between threads, and even if they were, the runtime assumes local scheduling and local neighbor relations.

So: this is best for **parallelism via sharding**, e.g.

- compiling many independent files/modules in parallel
- running multiple independent “sessions” (each with its own compiler/runtime)
- running heavy “analysis” jobs that only need to return summaries/results

## The harder goal: one compound network, heavy lifting on other threads

To offload heavy computation inside a single propagator network, you’d want something like:

- a propagator whose implementation is “remote”
- when its inputs change, it posts a job to a worker
- when the worker completes, it posts a result back
- the result is then written to an output cell (with causality/clock info)

This is feasible, but it requires **new infrastructure**:

- **Serializable boundary types**
  - Decide what crosses the boundary: plain JS values only, or layered data (vector clocks, TemporaryValueSet, etc.)
  - Define a codec (structured clone / JSON) for these values.
- **Remote-propagator adaptor**
  - A `construct_propagator`-style wrapper that submits jobs and handles responses.
  - Careful backpressure: coalesce rapid input changes, cancel outdated jobs.
- **Causality and merges**
  - If you use vector clocks, the worker must return clock metadata.
  - Merge semantics must remain coherent when updates arrive asynchronously.
- **Error channel**
  - Worker errors should become values (or contradictions) in the network, not just throw.

### Why `incremental_compiler.ts` matters for this

`incremental_compiler.ts` already models compilation as a reactive process, but many “apply” paths (e.g. function application) build propagators and return `void/undefined`. That’s fine for effects (wiring networks), but it means “querying” (`(? ...)`) only works when the inner form compiles to a `Cell` (so it can be summarized).

Any cross-thread offloading primitive should therefore be expressed as a propagator that **produces a cell** (or writes to an output cell), not as a “compile-time side effect”.

## Rough effort estimate (order-of-magnitude)

### Implemented prototype (independent compiler worker)

- **Code**: ~150–250 LOC across 2 new files
- **Risk**: low
- **Value**: parallel compilation / parallel sessions

### True cross-thread heavy-lifting inside one network

Minimum viable “remote propagator”:

- **Code**: ~400–900 LOC
  - worker protocol + codecs + cancellation/coalescing
  - adaptor propagator + tests
- **Risk**: medium
  - async semantics; determinism; scheduler interactions

Full integration with layered data / vector clocks / contradiction handling:

- **Code**: ~900–2000+ LOC
- **Risk**: higher
  - correctness of merge semantics under async delivery
  - performance + memory pressure

## Recommended next step

If the goal is “heavy lifting elsewhere” with minimal disruption:

- start by creating **one or two remote primitives** (e.g. a slow numeric transform, a graph query, or a batch compilation pass) that:
  - accept plain JSON-able inputs
  - return plain JSON-able outputs
  - integrate as a propagator writing to an output cell

That gets parallelism benefits while keeping the main compiler/network architecture intact.

