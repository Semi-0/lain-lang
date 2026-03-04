/**
 * Graphology query helpers for locating cells in the traced graph.
 * Use these to find nodes by card ownership, id, or label prefix.
 */
import type { DirectedGraph } from "graphology";
import { CARD_HEADER, SEP } from "../naming";

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

