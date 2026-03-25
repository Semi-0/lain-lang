/**
 * Tests for graph_combinators.ts + node_attrs enrichment in generalized_tracer.ts.
 *
 * Structure:
 *   Unit tests  — build a DirectedGraph directly, test each combinator in isolation.
 *   Integration — spin up a real propagator network, trace it, assert on the live graph.
 *
 * Each section maps to one query from docs/propagation-tracing.md.
 */
import { expect, test, describe, beforeEach } from "bun:test"
import { DirectedGraph } from "graphology"
import { construct_cell, update_cell, cell_strongest_base_value, cell_id } from "ppropogator/Cell/Cell"
import { p_add } from "ppropogator"
import { execute_all_tasks_sequential } from "ppropogator/Shared/Scheduler/Scheduler"

import {
  subgraph_by_kind,
  subgraph_by_namespace,
  subgraph_by_level,
  intersect_graphs,
  union_graphs,
  collapse_accessor_paths,
  annotate_cell_content,
  default_is_accessor,
} from "../compiler/tracer/graph_combinators"
import { node_attrs, trace_upstream, trace_downstream } from "../compiler/tracer/generalized_tracer"
import { clear_card_metadata } from "../src/grpc/card"
import { init_system } from "../compiler/incremental_compiler"
import { p_sync } from "ppropogator/Propagator/BuiltInProps"

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Build a small fixture graph with known attributes for unit tests. */
function make_fixture_graph(): DirectedGraph {
  const g = new DirectedGraph()
  g.addNode("c1", { kind: "cell",        namespace: "CARD", relationLevel: 3, label: "CARD|x|::this", value: "42" })
  g.addNode("c2", { kind: "cell",        namespace: "CARD", relationLevel: 3, label: "CARD|x|::left" })
  g.addNode("c3", { kind: "cell",        namespace: "Core", relationLevel: 5, label: "Core|Env|foo" })
  g.addNode("p1", { kind: "propagator",  namespace: "Core", relationLevel: 5, label: "Core|accessor|foo" })
  g.addNode("p2", { kind: "propagator",  namespace: "CARD", relationLevel: 2, label: "CARD|x|connector" })
  g.addEdge("c1", "p1")
  g.addEdge("p1", "c3")
  g.addEdge("c2", "p2")
  return g
}

// ── Unit: node_attrs ──────────────────────────────────────────────────────────

describe("node_attrs (metadata enrichment)", () => {
  beforeEach(() => { init_system(); clear_card_metadata() })

  test("cell node has kind=cell, namespace from name, relationLevel", () => {
    const c = construct_cell("CARD|test|::this")
    update_cell(c, 99)
    const attrs = node_attrs(c)
    expect(attrs.kind).toBe("cell")
    expect(attrs.namespace).toBe("CARD")
    expect(typeof attrs.relationLevel).toBe("number")
    expect(attrs.value).toBe("99")   // Q5: value in attrs
  })

  test("cell node has no value attr when cell is uninitialized", () => {
    const c = construct_cell("Core|Env|x")
    const attrs = node_attrs(c)
    expect(attrs.kind).toBe("cell")
    expect(attrs.namespace).toBe("Core")
    expect(attrs.value).toBeUndefined()
  })

  test("propagator node has kind=propagator, no value attr", () => {
    const a = construct_cell("a")
    const b = construct_cell("b")
    const c = construct_cell("c")
    const prop = p_add(a, b, c)
    const attrs = node_attrs(prop)
    expect(attrs.kind).toBe("propagator")
    expect(attrs.value).toBeUndefined()
    expect(typeof attrs.relationLevel).toBe("number")
  })
})

// ── Unit: subgraph_by_kind ────────────────────────────────────────────────────

describe("subgraph_by_kind", () => {
  // Q3: extract propagator subgraph for call graph analysis

  test("filters to cell nodes only", () => {
    const g = make_fixture_graph()
    const result = subgraph_by_kind(g, "cell")
    expect(result.hasNode("c1")).toBe(true)
    expect(result.hasNode("c2")).toBe(true)
    expect(result.hasNode("c3")).toBe(true)
    expect(result.hasNode("p1")).toBe(false)
    expect(result.hasNode("p2")).toBe(false)
  })

  test("filters to propagator nodes only", () => {
    const g = make_fixture_graph()
    const result = subgraph_by_kind(g, "propagator")
    expect(result.hasNode("p1")).toBe(true)
    expect(result.hasNode("p2")).toBe(true)
    expect(result.hasNode("c1")).toBe(false)
  })

  test("result only contains edges between kept nodes", () => {
    const g = make_fixture_graph()
    const result = subgraph_by_kind(g, "cell")
    expect(result.size).toBe(0)  // no cell→cell edges in fixture
  })
})

// ── Unit: subgraph_by_namespace ───────────────────────────────────────────────

describe("subgraph_by_namespace", () => {
  // Q1: all card-related nodes
  // Q2: Core nodes (including accessors)

  test("CARD namespace returns card nodes only", () => {
    const g = make_fixture_graph()
    const result = subgraph_by_namespace(g, "CARD")
    expect(result.hasNode("c1")).toBe(true)
    expect(result.hasNode("c2")).toBe(true)
    expect(result.hasNode("p2")).toBe(true)
    expect(result.hasNode("c3")).toBe(false)
    expect(result.hasNode("p1")).toBe(false)
  })

  test("Core namespace returns compiler-internal nodes", () => {
    const g = make_fixture_graph()
    const result = subgraph_by_namespace(g, "Core")
    expect(result.hasNode("c3")).toBe(true)
    expect(result.hasNode("p1")).toBe(true)
    expect(result.hasNode("c1")).toBe(false)
  })

  test("empty prefix matches all nodes", () => {
    const g = make_fixture_graph()
    const result = subgraph_by_namespace(g, "")
    expect(result.order).toBe(g.order)
  })

  test("unknown namespace returns empty graph", () => {
    const g = make_fixture_graph()
    const result = subgraph_by_namespace(g, "NONEXISTENT")
    expect(result.order).toBe(0)
  })
})

// ── Unit: subgraph_by_level ───────────────────────────────────────────────────

describe("subgraph_by_level", () => {
  // Q3: isolate primitive level propagators

  test("returns nodes at exact level", () => {
    const g = make_fixture_graph()
    const result = subgraph_by_level(g, 5)
    expect(result.hasNode("c3")).toBe(true)
    expect(result.hasNode("p1")).toBe(true)
    expect(result.hasNode("c1")).toBe(false)
    expect(result.hasNode("p2")).toBe(false)
  })

  test("returns empty graph for level with no nodes", () => {
    const g = make_fixture_graph()
    const result = subgraph_by_level(g, 99)
    expect(result.order).toBe(0)
  })
})

// ── Unit: intersect_graphs ────────────────────────────────────────────────────

describe("intersect_graphs", () => {
  // Compose two filters: Q1 example — card cells only

  test("returns nodes in both graphs", () => {
    const g = make_fixture_graph()
    const cards = subgraph_by_namespace(g, "CARD")
    const cells = subgraph_by_kind(g, "cell")
    const result = intersect_graphs(cards, cells)
    // c1, c2 are CARD cells; p2 is CARD propagator; c3, p1 are Core
    expect(result.hasNode("c1")).toBe(true)
    expect(result.hasNode("c2")).toBe(true)
    expect(result.hasNode("p2")).toBe(false)  // propagator, not cell
    expect(result.hasNode("c3")).toBe(false)  // cell but not CARD
  })

  test("intersection with empty graph returns empty graph", () => {
    const g = make_fixture_graph()
    const empty = new DirectedGraph()
    const result = intersect_graphs(g, empty)
    expect(result.order).toBe(0)
  })

  test("intersection with self returns same nodes", () => {
    const g = make_fixture_graph()
    const result = intersect_graphs(g, g)
    expect(result.order).toBe(g.order)
  })
})

// ── Unit: union_graphs ────────────────────────────────────────────────────────

describe("union_graphs", () => {
  // Q4: upstream + downstream of a card boundary

  test("returns all nodes from both graphs", () => {
    const a = new DirectedGraph()
    a.addNode("n1", { kind: "cell", namespace: "CARD", relationLevel: 1, label: "n1" })
    a.addNode("n2", { kind: "cell", namespace: "CARD", relationLevel: 1, label: "n2" })
    a.addEdge("n1", "n2")

    const b = new DirectedGraph()
    b.addNode("n2", { kind: "cell", namespace: "CARD", relationLevel: 1, label: "n2" })
    b.addNode("n3", { kind: "cell", namespace: "Core", relationLevel: 2, label: "n3" })
    b.addEdge("n2", "n3")

    const result = union_graphs(a, b)
    expect(result.hasNode("n1")).toBe(true)
    expect(result.hasNode("n2")).toBe(true)
    expect(result.hasNode("n3")).toBe(true)
    expect(result.size).toBe(2)  // both edges
  })

  test("union with empty graph returns original nodes", () => {
    const g = make_fixture_graph()
    const result = union_graphs(g, new DirectedGraph())
    expect(result.order).toBe(g.order)
  })

  test("union is commutative in node count", () => {
    const g = make_fixture_graph()
    const a = subgraph_by_namespace(g, "CARD")
    const b = subgraph_by_namespace(g, "Core")
    expect(union_graphs(a, b).order).toBe(union_graphs(b, a).order)
  })
})

// ── Integration: Q1 — namespace filter isolates CARD nodes ───────────────────
// Build a minimal network: two cells named "CARD|x|::this" and "CARD|x|::left"
// connected through a propagator, with a "Core|Env|foo" cell also present.
// After tracing, namespace filter should return only the CARD cells.

describe("Q1: card namespace filter via real trace", () => {
  beforeEach(() => { init_system(); clear_card_metadata() })

  test("traced graph namespace filter isolates CARD nodes", () => {
    const card_this = construct_cell("CARD|x|::this")
    const card_left = construct_cell("CARD|x|::left")
    const core_env  = construct_cell("Core|Env|foo")
    // card_this → core_env via p_sync (simulates compiler connector)
    p_sync(card_this, core_env)
    update_cell(card_this, 7)
    execute_all_tasks_sequential(console.error)

    const gatherer = construct_cell("gatherer-q1")
    trace_upstream(card_this, gatherer)
    execute_all_tasks_sequential(console.error)

    const graph = cell_strongest_base_value(gatherer) as DirectedGraph
    expect(graph).toBeInstanceOf(DirectedGraph)
    expect(graph.order).toBeGreaterThan(0)

    // Q1: CARD-namespaced nodes are present
    const card_sg = subgraph_by_namespace(graph, "CARD")
    expect(card_sg.order).toBeGreaterThan(0)

    // Every node in the result must have namespace "CARD"
    card_sg.forEachNode((_, attrs) => {
      expect(String(attrs.namespace).startsWith("CARD")).toBe(true)
    })
  })
})

// ── Integration: Q4 — upstream + downstream union ────────────────────────────
// Three cells in a chain: up → mid → down.
// Tracing upstream from mid gives {up, mid}; downstream gives {mid, down}.
// Union gives all three.

describe("Q4: upstream + downstream union", () => {
  beforeEach(() => { init_system(); clear_card_metadata() })

  test("union of trace_upstream and trace_downstream covers both directions", () => {
    const up_cell  = construct_cell("CARD|src|::this")
    const mid_cell = construct_cell("CARD|mid|::this")
    const dn_cell  = construct_cell("CARD|dst|::this")
    p_sync(up_cell,  mid_cell)
    p_sync(mid_cell, dn_cell)
    execute_all_tasks_sequential(console.error)

    const g_up   = construct_cell("g_up")
    const g_down = construct_cell("g_down")
    trace_upstream(mid_cell, g_up)
    trace_downstream(mid_cell, g_down)
    execute_all_tasks_sequential(console.error)

    const up   = cell_strongest_base_value(g_up)   as DirectedGraph
    const down = cell_strongest_base_value(g_down) as DirectedGraph
    expect(up.order).toBeGreaterThan(0)
    expect(down.order).toBeGreaterThan(0)

    // Q4: union gives the full bidirectional neighbourhood
    const full = union_graphs(up, down)
    expect(full.order).toBeGreaterThanOrEqual(Math.max(up.order, down.order))
    // mid_cell is reachable from both sides, so it appears in full
    expect(full.hasNode(cell_id(mid_cell))).toBe(true)
  })
})

// ── Integration: Q5 — value attribute on cell nodes ──────────────────────────

describe("Q5: cell value in graph node attrs", () => {
  beforeEach(() => { init_system(); clear_card_metadata() })

  test("cell with a known value has it in node attrs after trace", () => {
    const val_cell = construct_cell("CARD|val|::this")
    const dep_cell = construct_cell("CARD|val|::left")
    p_sync(val_cell, dep_cell)
    update_cell(val_cell, 42)
    execute_all_tasks_sequential(console.error)
    

    const gatherer = construct_cell("gatherer-q5")
    trace_upstream(dep_cell, gatherer)
    execute_all_tasks_sequential(console.error)

    const graph = cell_strongest_base_value(gatherer) as DirectedGraph
    // At least one node carries a value attribute (the cell with value 42)
    const with_value = graph.nodes().find(id =>
      graph.getNodeAttribute(id, "value") !== undefined
    )
    expect(with_value).toBeDefined()
    // val_cell itself should have value "42"
    const val_id = cell_id(val_cell)
    expect(graph.getNodeAttribute(val_id, "value")).toBe("42")
  })
})

// ── Integration: Q3 — propagator-only subgraph for call graph ────────────────

describe("Q3: propagator subgraph for call graph analysis", () => {
  beforeEach(() => { init_system(); clear_card_metadata() })

  test("subgraph_by_kind propagator contains only propagator nodes", () => {
    const a = construct_cell("CARD|calc|a")
    const b = construct_cell("CARD|calc|b")
    const c = construct_cell("CARD|calc|c")
    p_add(a, b, c)
    update_cell(a, 1)
    update_cell(b, 2)
    execute_all_tasks_sequential(console.error)

    const gatherer = construct_cell("gatherer-q3")
    trace_upstream(c, gatherer)
    execute_all_tasks_sequential(console.error)

    const graph = cell_strongest_base_value(gatherer) as DirectedGraph
    const props  = subgraph_by_kind(graph, "propagator")

    expect(props.order).toBeGreaterThan(0)
    props.forEachNode((_, attrs) => {
      expect(attrs.kind).toBe("propagator")
    })
  })
})

// ── Unit: collapse_accessor_paths (Q2) ───────────────────────────────────────
// Build a graph manually: two non-accessor nodes connected through
// an accessor chain.  After collapse: direct edge, no accessor nodes.

describe("Q2: collapse_accessor_paths", () => {
  test("replaces accessor chain with direct edge", () => {
    const g = new DirectedGraph()
    g.addNode("prim_a",  { kind: "propagator", namespace: "CARD",         label: "CARD|x|sum",           relationLevel: 3 })
    g.addNode("acc_cell",{ kind: "cell",        namespace: "Core",         label: "Core|accessor|foo",    relationLevel: 5 })
    g.addNode("acc_prop",{ kind: "propagator",  namespace: "Core",         label: "Core|accessor|lookup", relationLevel: 5 })
    g.addNode("prim_b",  { kind: "cell",        namespace: "CARD",         label: "CARD|x|result",        relationLevel: 3 })
    g.addEdge("prim_a",  "acc_cell")
    g.addEdge("acc_cell","acc_prop")
    g.addEdge("acc_prop","prim_b")

    const result = collapse_accessor_paths(g)

    // accessor nodes removed
    expect(result.hasNode("acc_cell")).toBe(false)
    expect(result.hasNode("acc_prop")).toBe(false)

    // source and target kept
    expect(result.hasNode("prim_a")).toBe(true)
    expect(result.hasNode("prim_b")).toBe(true)

    // direct edge added
    expect(result.hasEdge("prim_a", "prim_b")).toBe(true)
  })

  test("default_is_accessor only matches Core|accessor labels", () => {
    const g = new DirectedGraph()
    g.addNode("a", { label: "Core|accessor|x",  kind: "cell", namespace: "Core", relationLevel: 5 })
    g.addNode("b", { label: "Core|Env|x",       kind: "cell", namespace: "Core", relationLevel: 5 })
    g.addNode("c", { label: "CARD|foo|::this",  kind: "cell", namespace: "CARD", relationLevel: 3 })
    expect(default_is_accessor(g, "a")).toBe(true)
    expect(default_is_accessor(g, "b")).toBe(false)
    expect(default_is_accessor(g, "c")).toBe(false)
  })

  test("non-accessor nodes with direct edges are preserved unchanged", () => {
    const g = new DirectedGraph()
    g.addNode("x", { kind: "cell", namespace: "CARD", label: "CARD|a", relationLevel: 2 })
    g.addNode("y", { kind: "cell", namespace: "CARD", label: "CARD|b", relationLevel: 2 })
    g.addEdge("x", "y")

    const result = collapse_accessor_paths(g)
    expect(result.hasNode("x")).toBe(true)
    expect(result.hasNode("y")).toBe(true)
    expect(result.hasEdge("x", "y")).toBe(true)
  })

  test("accessor-only graph collapses to empty", () => {
    const g = new DirectedGraph()
    g.addNode("a", { label: "Core|accessor|x", kind: "cell", namespace: "Core", relationLevel: 5 })
    g.addNode("b", { label: "Core|accessor|y", kind: "cell", namespace: "Core", relationLevel: 5 })
    g.addEdge("a", "b")

    const result = collapse_accessor_paths(g)
    expect(result.order).toBe(0)
    expect(result.size).toBe(0)
  })

  test("custom is_accessor predicate is respected", () => {
    const g = new DirectedGraph()
    g.addNode("a", { kind: "cell", namespace: "X", label: "X|a", relationLevel: 1 })
    g.addNode("mid", { kind: "cell", namespace: "X", label: "X|mid", relationLevel: 1 })
    g.addNode("b", { kind: "cell", namespace: "X", label: "X|b", relationLevel: 1 })
    g.addEdge("a", "mid")
    g.addEdge("mid", "b")

    // Treat "mid" as an accessor
    const custom_is_accessor: typeof default_is_accessor = (_, id) => id === "mid"
    const result = collapse_accessor_paths(g, custom_is_accessor)

    expect(result.hasNode("mid")).toBe(false)
    expect(result.hasEdge("a", "b")).toBe(true)
  })
})

// ── Integration: Q2 — collapse accessor chains in a real traced graph ─────────

describe("Q2 integration: collapse in a real traced propagator graph", () => {
  beforeEach(() => { init_system(); clear_card_metadata() })

  test("collapsed graph has no accessor nodes, primitive connectivity preserved", () => {
    // Build: prim_a → accessor_cell → prim_b
    const prim_a    = construct_cell("CARD|net|in")
    const acc_cell  = construct_cell("Core|accessor|bridge")
    const prim_b    = construct_cell("CARD|net|out")
    p_sync(prim_a, acc_cell)
    p_sync(acc_cell, prim_b)
    update_cell(prim_a, 1)
    execute_all_tasks_sequential(console.error)

    const gatherer = construct_cell("gatherer-q2")
    trace_upstream(prim_b, gatherer)
    execute_all_tasks_sequential(console.error)

    const graph    = cell_strongest_base_value(gatherer) as DirectedGraph
    const collapsed = collapse_accessor_paths(graph)

    // No accessor nodes in result
    collapsed.forEachNode((_, attrs) => {
      expect(String(attrs.label ?? "").startsWith("Core|accessor")).toBe(false)
    })

    // prim_a and prim_b still present (they're non-accessors)
    const prim_a_id = cell_id(prim_a)
    const prim_b_id = cell_id(prim_b)
    expect(collapsed.hasNode(prim_a_id)).toBe(true)
    expect(collapsed.hasNode(prim_b_id)).toBe(true)
  })
})

// ── Unit: annotate_cell_content (Q6) ─────────────────────────────────────────

describe("Q6: annotate_cell_content", () => {
  beforeEach(() => { init_system(); clear_card_metadata() })

  test("adds content attr to cell nodes, skips propagator nodes", () => {
    const a = construct_cell("CARD|val|a")
    const b = construct_cell("CARD|val|b")
    update_cell(a, 10)
    p_add(a, a, b)   // b = a + a
    execute_all_tasks_sequential(console.error)

    const gatherer = construct_cell("gatherer-q6")
    trace_upstream(b, gatherer)
    execute_all_tasks_sequential(console.error)

    const graph     = cell_strongest_base_value(gatherer) as DirectedGraph
    const annotated = annotate_cell_content(graph)

    // All cell nodes should now have a content attribute
    annotated.forEachNode((_, attrs) => {
      if (attrs.kind === "cell") {
        expect(attrs.content).toBeDefined()
        expect(typeof attrs.content).toBe("string")
      } else {
        // propagator nodes should not have content
        expect(attrs.content).toBeUndefined()
      }
    })
  })

  test("custom predicate limits annotation to matching nodes only", () => {
    const a = construct_cell("CARD|sel|a")
    const b = construct_cell("CARD|sel|b")
    update_cell(a, 5)
    p_sync(a, b)
    execute_all_tasks_sequential(console.error)

    const gatherer = construct_cell("gatherer-q6b")
    trace_upstream(b, gatherer)
    execute_all_tasks_sequential(console.error)

    const graph = cell_strongest_base_value(gatherer) as DirectedGraph
    const a_id  = cell_id(a)

    // Only annotate node a
    const annotated = annotate_cell_content(
      graph,
      (_, id) => id === a_id
    )

    expect(annotated.getNodeAttribute(a_id, "content")).toBeDefined()
    // b should not have content
    expect(annotated.getNodeAttribute(cell_id(b), "content")).toBeUndefined()
  })
})
