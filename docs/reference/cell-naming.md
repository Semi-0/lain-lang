# Cell Naming Convention

Unified naming for cells and propagators across the tracer graph, compiler, and card API.

## Format

All names use the pipe character `|` as separator. Structure: `{HEADER}|{...parts}`

## Cell Types

| Type | Format | Example |
|------|--------|---------|
| **CELL** | `CELL|{cell_name}` | `CELL|root`, `CELL|CARD|uuid|::this` |
| **PROPAGATOR** | `PROPAGATOR|{propagator_name}` | `PROPAGATOR|sync` |
| **CARD** | `CARD|{cardId}|{slot}` | `CARD|abc-123|::this` |
| **Core** (compiler) | See below | `Core|accessor|out` |

## Core Cells (Compiler-Generated)

| Subtype | Format | Example |
|---------|--------|---------|
| Accessor | `Core|accessor|{key}` | `Core|accessor|out`, `Core|accessor|parent` |
| Constant | `Core|Constant` or `Core|Constant|{value}` | `Core|Constant|42` |
| Env | `Core|Env|{key}` | `Core|Env|root` |

## Card Slot Cells

Card slot cells (::this, ::left, ::right, ::above, ::below) use:

```
CARD|{cardId}|{slot}
```

Example: `CARD|550e8400-e29b-41d4-a716-446655440000|::this`

## Graphology Location Helpers

Import from `lain-lang/compiler/tracer/graph_queries`:

**Node lookup (returns IDs or attributes):**

- **find_cells_by_card(graph, cardId)** — Node IDs whose label contains `CARD|{cardId}|`
- **find_cell_by_id(graph, id)** — Node attributes by id, or null
- **find_cells_by_label_prefix(graph, prefix)** — Node IDs whose label starts with prefix

**Induced subgraphs** (uses `graphology-operators/subgraph`; returns a new DirectedGraph):

- **get_subgraph_by_card(graph, cardId)** — Subgraph of nodes whose label includes `CARD|{cardId}|`
- **get_subgraph_by_label_prefix(graph, prefix)** — Subgraph of nodes whose label starts with prefix
- **get_subgraph_by_nodes(graph, nodeIds)** — Induced subgraph for given node IDs (array or Set)

**Important — label prefix for `graph:label`:** In the traced graph, every node label starts with `CELL|` or `PROPAGATOR|` (e.g. `CELL|root`, `CELL|CARD|uuid|::this`). So prefix `"CARD|"` matches **no** nodes. To get all card slot cells, use prefix **`"CELL|CARD|"`**. Constant: `TRACED_GRAPH_LABEL_PREFIX_CARD_CELLS` from `graph_queries`.

Example:

```ts
import {
  find_cells_by_card,
  find_cell_by_id,
  get_subgraph_by_card,
  get_subgraph_by_label_prefix,
  TRACED_GRAPH_LABEL_PREFIX_CARD_CELLS,
} from "lain-lang/compiler/tracer/graph_queries";
import type { DirectedGraph } from "graphology";

const graph: DirectedGraph = /* from tracer gatherer */;
const cardCellIds = find_cells_by_card(graph, "my-card-uuid");
const node = find_cell_by_id(graph, "some-cell-id");

// Get induced subgraph (nodes + edges between them)
const cardSubgraph = get_subgraph_by_card(graph, "my-card-uuid");
const cellSubgraph = get_subgraph_by_label_prefix(graph, "CELL|");
// All card slot cells only (use "CELL|CARD|", not "CARD|"):
const cardCellsSubgraph = get_subgraph_by_label_prefix(graph, TRACED_GRAPH_LABEL_PREFIX_CARD_CELLS);
```

## Usage

- **Tracer**: Uses `create_cell_label` and `create_propagator_label` for graph node labels.
- **Compiler**: Uses `core_accessor_name`, `core_constant_value_name`, `core_env_name` when creating cells.
- **Card API**: Uses `create_card_cell_name` in `p_construct_card_cell`.
