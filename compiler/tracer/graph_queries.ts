/**
 * Graphology query helpers for locating cells in the traced graph.
 * Use these to find nodes by card ownership, id, or label prefix.
 * Use subgraph helpers to get induced subgraphs (nodes + edges between them).
 */
import type { DirectedGraph } from "graphology";
import { subgraph } from "graphology-operators";
import { CARD_HEADER, SEP } from "../naming";
import { function_to_primitive_propagator } from "ppropogator"
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