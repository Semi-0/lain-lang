/**
 * Graphology query helpers for locating cells in the traced graph.
 * Use these to find nodes by card ownership, id, or label prefix.
 * Use subgraph helpers to get induced subgraphs (nodes + edges between them).
 *
 * Important: Graph node labels always start with "CELL|" or "PROPAGATOR|".
 * Card slot cells have label "CELL|CARD|{cardId}|{slot}". So to get all card cells
 * with graph:label / get_subgraph_by_label_prefix, use prefix "CELL|CARD|" (not "CARD|").
 */
import type { DirectedGraph } from "graphology";
import { subgraph } from "graphology-operators";
import { CARD_HEADER, SEP, TRACED_GRAPH_LABEL_PREFIX_CARD_CELLS } from "../naming";

/** Re-export for frontend: use this as the prefix with graph:label to get all card cells. */
export { TRACED_GRAPH_LABEL_PREFIX_CARD_CELLS };
import { function_to_primitive_propagator } from "ppropogator"

import {bidirectional} from "graphology-shortest-path";
/**
 * Find node IDs whose label contains CARD|{cardId}| (e.g. CELL|CARD|{cardId}|::this).
 */
export const find_cells_by_card = (graph: DirectedGraph, cardId: string): string[] => {
  const cardPrefix = [CARD_HEADER, cardId, ""].join(SEP);
  const result: string[] = [];
  graph.forEachNode((id) => {
    const label = graph.getNodeAttribute(id, "label");
    if (typeof label === "string" && label.includes(cardPrefix)) {
      result.push(id);
    }
  });
  return result;
};

/**
 * Get node attributes by id if the node exists.
 */
export const find_cell_by_id = (
  graph: DirectedGraph,
  id: string
): { id: string; label: string } | null => {
  if (!graph.hasNode(id)) return null;
  const label = graph.getNodeAttribute(id, "label");
  return { id, label: typeof label === "string" ? label : String(label ?? "") };
};


type Attr = Record<string, any>;

const isMatch = (attr: Attr, prefix: string) => {
  const label = attr?.label;
  return typeof label === "string" && label.startsWith(prefix);
};

/**
 * Returns a subgraph that contains:
 *  - all nodes whose label starts with prefix
 *  - plus any intermediate nodes needed to connect matched nodes
 *    (via shortest paths in the *undirected* sense, so it finds “between” even if direction flips)
 *
 * If you want direction-respecting paths, tell me and I’ll switch it.
 */
export const get_connected_subgraph_by_label_prefix = (
  graph: DirectedGraph,
  prefix: string
): DirectedGraph => {
  const matched: string[] = [];

  graph.forEachNode((key, attr) => {
    if (isMatch(attr as Attr, prefix)) matched.push(key);
  });

  // Nothing or single node matched -> induced subgraph is fine
  if (matched.length <= 1) {
    return subgraph(graph, (k, a) => isMatch(a as Attr, prefix)) as DirectedGraph;
  }

  const keep = new Set<string>(matched);

  // Union nodes on shortest paths between every pair of matched nodes
  for (let i = 0; i < matched.length; i++) {
    for (let j = i + 1; j < matched.length; j++) {
      const a = matched[i];
      const b = matched[j];

      // Returns an array of node keys along the path, or null if disconnected
      const path = bidirectional(graph, a, b);

      if (path && path.length) {
        for (const node of path) keep.add(node);
      }
    }
  }

  // Induce subgraph from expanded node set
  return subgraph(graph, (key) => keep.has(key)) as DirectedGraph;
};

export const p_graph_connected_prefix = function_to_primitive_propagator(
  "graph_connected_prefix",
  get_connected_subgraph_by_label_prefix
);
/**
 * Find node IDs whose label starts with the given prefix.
 */
export const find_cells_by_label_prefix = (
  graph: DirectedGraph,
  prefix: string
): string[] => {
  const result: string[] = [];
  graph.forEachNode((id) => {
    const label = graph.getNodeAttribute(id, "label");
    if (typeof label === "string" && label.startsWith(prefix)) {
      result.push(id);
    }
  });
  return result;
};


export const get_subgraph_by_name = (
  graph: DirectedGraph,
  name: string
): DirectedGraph => {
  return subgraph(graph, (key: string, attr: Record<string, unknown>) => {
    const label = attr?.label;
    return typeof label === "string" && label.includes(name);
  }) as DirectedGraph;
};

export const p_graph_name = function_to_primitive_propagator(
  "graph_name",
  get_subgraph_by_name
);
/**
 * Return the induced subgraph containing nodes whose label includes CARD|{cardId}|.
 * Includes all edges between those nodes (graphology-operators subgraph).
 */
export const get_subgraph_by_card = (
  graph: DirectedGraph,
  cardId: string
): DirectedGraph => {
  const cardPrefix = [CARD_HEADER, cardId, ""].join(SEP);
  return subgraph(
    graph,
    (key: string, attr: Record<string, unknown>) => {
      const label = attr?.label;
      return typeof label === "string" && label.includes(cardPrefix);
    }
  ) as DirectedGraph;
};

export const p_graph_card = function_to_primitive_propagator(
  "graph_card",
  get_subgraph_by_card
);
/**
 * Return the induced subgraph containing nodes whose label starts with the prefix.
 * Includes all edges between those nodes.
 */
export const get_subgraph_by_label_prefix = (
  graph: DirectedGraph,
  prefix: string
): DirectedGraph => {
  console.log("get_subgraph_by_label_prefix", prefix);
  return subgraph(
    graph,
    (key: string, attr: Record<string, unknown>) => {
      const label = attr?.label;
      return typeof label === "string" && label.startsWith(prefix);
    }
  ) as DirectedGraph;
};

export const p_graph_label_prefix = function_to_primitive_propagator(
  "graph_label",
  get_subgraph_by_label_prefix
);


/**
 * Return the induced subgraph for the given node IDs.
 * Includes all edges between those nodes.
 */
export const get_subgraph_by_nodes = (
  graph: DirectedGraph,
  nodeIds: string[] | Set<string>
): DirectedGraph => subgraph(graph, nodeIds) as DirectedGraph;


export const p_graph_nodes = function_to_primitive_propagator(
  "graph_nodes",
  get_subgraph_by_nodes
);