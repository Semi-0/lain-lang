# Lain-lang documentation

Docs are grouped by role. Start here, then open the folder that matches what you need.

| Folder | Contents |
|--------|----------|
| [`architecture/`](architecture/) | Backend shape, Connect server, dataflow vs frontend |
| [`protocol/`](protocol/) | Connect / RPC protocol notes |
| [`planning/`](planning/) | Implementation plans and design scratchpads |
| [`reference/`](reference/) | Specs, tracing, naming conventions |
| [`guides/`](guides/) | How-to (e.g. worker threads) |
| [`issues/`](issues/) | Focused bug / edge-case write-ups |
| [`meta/`](meta/) | Contributor tooling (e.g. LLM notes) |
| [`TODOS/`](TODOS/) | Dated / themed task lists |

## Quick links

### Architecture & runtime

- [Backend architecture](architecture/BACKEND-ARCHITECTURE.md) — Connect API, sessions, cards
- [Connect server](architecture/CONNECT-SERVER.md) — components and CLI
- [Dataflow / backend / frontend](architecture/DATAFLOW_BACKEND_FRONTEND.md)

### Protocol

- [Connect protocol](protocol/CONNECT-PROTOCOL.md) — concepts and client usage

### Planning & reference

- [Cards implementation plan](planning/CARDS-IMPLEMENTATION-PLAN.md)
- [`ce_dict` accessor cache](planning/CE_DICT_ACCESSOR_CACHE.md)
- [Specs](reference/specs.md)
- [Propagation tracing](reference/propagation-tracing.md)
- [Cell naming](reference/cell-naming.md)

### Guides & issues

- [Worker threads](guides/WORKER_THREADS.md)
- [Card compile / neighbor bug](issues/CARD-COMPILE-NEIGHBOR-BUG.md)

### Meta

- [LLM guideline](meta/llm-guideline.md)

---

Repository root **[README.md](../README.md)** and **[README-zh.md](../README-zh.md)** remain the main overview and quick start.
