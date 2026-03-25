/**
 * Graph combinators for querying traced propagator graphs.
 *
 * Two layers:
 *   - Functional (subgraph_by_*, intersect_graphs, union_graphs, collapse_accessor_paths,
 *     annotate_cell_content) — pure transforms on a Graphology DirectedGraph.
 *   - Propagator (p_graph_*) — wrapped for stdlib registration.
 *
 * All functions expect node attributes produced by node_attrs() in generalized_tracer.ts:
 *   { label, kind, namespace, relationLevel, value? }
 *
 * Answering the query catalog from docs/propagation-tracing.md:
 *   Q1  all network for a card    → graph:dependents + graph:namespace "CARD"
 *   Q2  primitives w/o accessors  → graph:prim-dependents + graph:collapse-accessors
 *   Q3  call graph of primitives  → graph:kind "propagator" + graph:at-level <n>
 *   Q4  card upstream+downstream  → graph:union (graph:dependents slot) (graph:downstream slot)
 *   Q5  display values            → value attr already present on cell nodes after trace
 *   Q6  inspect cell content      → graph:annotate-content (opt-in deep LayeredObject dump)
 */
import { DirectedGraph } from "graphology"
import { subgraph } from "graphology-operators"
import { function_to_primitive_propagator } from "ppropogator"
import { find_cell_by_id } from "ppropogator/Shared/GraphTraversal"
import { cell_content } from "ppropogator/Cell/Cell"
import { to_string } from "generic-handler/built_in_generics/generic_conversation"
import { bfsFromNode } from "graphology-traversal/bfs"
import { set_union } from "../helper/set"

// ── Subgraph filters ──────────────────────────────────────────────────────────

const induced_subgraph_by_node_predicate = (
  graph: DirectedGraph,
  keep: (id: string, attrs: Record<string, any>) => boolean
): DirectedGraph => {
  const result = graph.copy() as DirectedGraph
  const drop_ids: string[] = []

  result.forEachNode((id, attrs) => {
    if (!keep(id, attrs as Record<string, any>)) drop_ids.push(id)
  })

  for (const id of drop_ids) result.dropNode(id)
  return result
}
const collect_reachable_from_anchors = (
  graph: DirectedGraph,
  anchor_ids: Set<string>,
  mode: "outbound" | "inbound"
): Set<string> => {
  const visited = new Set<string>()
  for (const seed of anchor_ids) {
    bfsFromNode(
      graph,
      seed,
      (id) => {
        visited.add(String(id))
      },
      { mode }
    )
  }
  return visited
}

const nodes_connected_to_anchors_any_direction = (
  graph: DirectedGraph,
  anchor_ids: Set<string>
): Set<string> => {
  const reachable_from_anchor = collect_reachable_from_anchors(graph, anchor_ids, "outbound")
  const can_reach_anchor = collect_reachable_from_anchors(graph, anchor_ids, "inbound")

  return set_union(reachable_from_anchor, can_reach_anchor)
}

/**
 * Nodes matching kind "cell" or "propagator".
 * Q3: graph:kind g "propagator"  → only propagator nodes for call graph analysis
 */
export const subgraph_by_kind = (
  graph: DirectedGraph,
  kind: "cell" | "propagator"
): DirectedGraph =>
  induced_subgraph_by_node_predicate(graph, (_, attrs) => attrs?.kind === kind)

/**
 * Nodes whose namespace starts with the given prefix.
 * Q1: graph:namespace g "CARD"  → all card cells and connectors
 * Q2: graph:namespace g "Core"  → compiler-internal nodes (accessors, env, constants)
 */
export const subgraph_by_namespace = (
  graph: DirectedGraph,
  ns: string
): DirectedGraph =>
  induced_subgraph_by_node_predicate(graph, (_, attrs) =>
    typeof attrs?.namespace === "string" && attrs.namespace.startsWith(ns)
  )

/**
 * Namespace filter that preserves bridge nodes/edges connected to matching
 * namespace nodes in either direction.
 *
 * Example:
 *   CARD:a → Core:x → Core:y
 * filtering by "CARD" keeps {a, x, y} and all path edges.
 *
 * Also keeps inbound-only chains:
 *   Core:u → Core:v → CARD:b
 * filtering by "CARD" keeps {u, v, b} and all path edges.
 */
export const subgraph_by_namespace_connected = (
  graph: DirectedGraph,
  ns: string
): DirectedGraph => {
  const anchors = new Set<string>()
  graph.forEachNode((id, attrs) => {
    if (typeof attrs?.namespace === "string" && attrs.namespace.startsWith(ns)) {
      anchors.add(id)
    }
  })

  const kept_ids = nodes_connected_to_anchors_any_direction(graph, anchors)
  return induced_subgraph_by_node_predicate(graph, (id) => kept_ids.has(id))
}

/**
 * Nodes at exactly the given relation level.
 * Q3: graph:at-level g 5  → primitive-level propagators only
 */
export const subgraph_by_level = (
  graph: DirectedGraph,
  level: number
): DirectedGraph =>
  induced_subgraph_by_node_predicate(graph, (_, attrs) => attrs?.relationLevel === level)

// ── Graph algebra ─────────────────────────────────────────────────────────────

/**
 * Nodes present in both a and b (induced subgraph of a restricted to b's nodes).
 * Use to compose two independent filters:
 *   intersect_graphs(subgraph_by_namespace(g,"CARD"), subgraph_by_kind(g,"cell"))
 *   → card cells only
 */
export const intersect_graphs = (a: DirectedGraph, b: DirectedGraph): DirectedGraph =>
  subgraph(a, (id) => b.hasNode(id)) as DirectedGraph

/**
 * Nodes present in a or b, with all edges from both.
 * Q4: union_graphs(trace_upstream_result, trace_downstream_result)
 *     → full bidirectional neighbourhood of a card boundary cell
 */
export const union_graphs = (a: DirectedGraph, b: DirectedGraph): DirectedGraph => {
  const result = a.copy() as DirectedGraph
  b.forEachNode((id, attrs) => result.mergeNode(id, attrs))
  b.forEachEdge((_, attrs, source, target) => {
    if (result.hasNode(source) && result.hasNode(target)) {
      result.mergeEdge(source, target, attrs)
    }
  })
  return result
}

// ── Q2: Accessor path collapse ────────────────────────────────────────────────

/**
 * Predicate type for identifying accessor/indirection nodes.
 * Default matches compiler-generated accessor cells: label starts with "Core|accessor".
 */
export type IsAccessorFn = (graph: DirectedGraph, id: string) => boolean

export const default_is_accessor: IsAccessorFn = (graph, id) => {
  const label = String(graph.getNodeAttribute(id, "label") ?? "")
  return label.startsWith("Core|accessor")
}

/**
 * BFS from source through accessor-only intermediate nodes.
 * Returns the first non-accessor nodes reached.
 */
const reach_non_accessor = (
  graph: DirectedGraph,
  source_id: string,
  is_accessor: IsAccessorFn
): string[] => {
  const result: string[] = []
  const visited = new Set<string>([source_id])
  const queue = [...graph.outNeighbors(source_id)]

  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!
    if (visited.has(id)) continue
    visited.add(id)
    if (is_accessor(graph, id)) {
      for (const n of graph.outNeighbors(id)) queue.push(n)
    } else {
      result.push(id)
    }
  }
  return result
}

/**
 * Q2: Remove accessor/indirection nodes and replace the paths they form with
 * direct edges between the primitive propagators on either side.
 *
 * Example:
 *   primA → accessor_cell → lookup_prop → env_cell → primB
 *   becomes:
 *   primA → primB
 *
 * @param is_accessor  Override to customize which nodes count as accessor indirection.
 *                     Defaults to nodes whose label starts with "Core|accessor".
 */
export const collapse_accessor_paths = (
  graph: DirectedGraph,
  is_accessor: IsAccessorFn = default_is_accessor
): DirectedGraph => {
  const result = new DirectedGraph()

  // Keep only non-accessor nodes with their attributes
  graph.forEachNode((id, attrs) => {
    if (!is_accessor(graph, id)) result.mergeNode(id, attrs)
  })

  // For each kept node, find where its edges land after collapsing accessor chains
  graph.forEachNode((id, _) => {
    if (is_accessor(graph, id)) return
    const targets = reach_non_accessor(graph, id, is_accessor)
    for (const target of targets) {
      if (result.hasNode(target) && !result.hasEdge(id, target)) {
        result.addEdge(id, target)
      }
    }
  })

  return result
}

// ── Q6: Annotate cell content ─────────────────────────────────────────────────

/**
 * Q6: Enrich cell nodes in the graph with their full LayeredObject content.
 * Opt-in: only annotates nodes where predicate returns true (default: all cells).
 *
 * Adds a `content` attribute (string summary) to each matched node.
 * Uses find_cell_by_id to recover the live cell from the global snapshot.
 * Nodes whose cell is not found (already GC'd) are skipped silently.
 *
 * @param predicate  Optional filter — receives (graph, nodeId, attrs), defaults to all cells.
 */
export const annotate_cell_content = (
  graph: DirectedGraph,
  predicate: (graph: DirectedGraph, id: string, attrs: Record<string, any>) => boolean =
    (_, __, attrs) => attrs?.kind === "cell"
): DirectedGraph => {
  const result = graph.copy() as DirectedGraph

  result.forEachNode((id, attrs) => {
    if (!predicate(result, id, attrs)) return
    const cell = find_cell_by_id(id)
    if (cell === undefined) return
    const content = cell_content(cell)
    result.mergeNodeAttributes(id, { content: to_string(content) })
  })

  return result
}

// ── Primitive propagators (registered in stdlib) ──────────────────────────────

/** graph:kind — filter to "cell" or "propagator" nodes */
export const p_graph_kind = function_to_primitive_propagator(
  "graph_kind",
  subgraph_by_kind
)

/** graph:namespace — filter by namespace prefix ("CARD", "Core", …) */
export const p_graph_namespace = function_to_primitive_propagator(
  "graph_namespace",
  subgraph_by_namespace
)

/** graph:namespace-connected — namespace filter that preserves connecting paths */
export const p_graph_namespace_connected = function_to_primitive_propagator(
  "graph_namespace_connected",
  subgraph_by_namespace_connected
)

/** graph:at-level — filter by exact relation level number */
export const p_graph_at_level = function_to_primitive_propagator(
  "graph_at_level",
  subgraph_by_level
)

/** graph:intersect — intersection of two subgraphs */
export const p_graph_intersect = function_to_primitive_propagator(
  "graph_intersect",
  intersect_graphs
)

/** graph:union — union of two subgraphs */
export const p_graph_union = function_to_primitive_propagator(
  "graph_union",
  union_graphs
)

/** graph:collapse-accessors — Q2: replace accessor indirection chains with direct edges */
export const p_graph_collapse_accessors = function_to_primitive_propagator(
  "graph_collapse_accessors",
  (graph: DirectedGraph) => collapse_accessor_paths(graph)
)

/** graph:annotate-content — Q6: enrich cell nodes with their full LayeredObject content */
export const p_graph_annotate_content = function_to_primitive_propagator(
  "graph_annotate_content",
  (graph: DirectedGraph) => annotate_cell_content(graph)
)
