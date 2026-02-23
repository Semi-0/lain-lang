/**
 * Structural card graph state.
 * Pure model layer (ids + edges), no propagator/cell lifecycle.
 */
import { register_predicate } from "ppropogator";
import { all_slots } from "./schema.js";

export type SlotName = (typeof all_slots)[number];

export interface GraphEdge {
    from_id: string;
    from_slot: SlotName;
    to_id: string;
    to_slot: SlotName;
}

export const is_slot_name = register_predicate(
    "is_slot_name",
    (value: unknown): value is SlotName =>
        typeof value === "string" && all_slots.includes(value as SlotName)
);

const edge_key_separator = "!!*!!";
const edge_key = (edge: GraphEdge) =>
    `${edge.from_id}${edge_key_separator}${edge.to_id}`;

const parse_edge_key = (key: string) => {
    const parts = key.split(edge_key_separator);
    return {
        from_id: parts[0] ?? "",
        to_id: parts.slice(1).join(edge_key_separator) || "",
    };
};

const card_ids = new Set<string>();
const edges = new Map<string, GraphEdge>();

export const add_graph_card = (id: string): void => {
    card_ids.add(id);
};

export const remove_graph_card = (id: string): GraphEdge[] => {
    card_ids.delete(id);
    const removed_edges: GraphEdge[] = [];
    edges.forEach((edge, key) => {
        if (edge.from_id === id || edge.to_id === id) {
            removed_edges.push(edge);
            edges.delete(key);
        }
    });
    return removed_edges;
};

export const upsert_graph_edge = (edge: GraphEdge): void => {
    edges.set(edge_key(edge), edge);
};

export const remove_graph_edge = (
    from_id: string,
    to_id: string
): GraphEdge | undefined => {
    const key = `${from_id}${edge_key_separator}${to_id}`;
    const existing = edges.get(key);
    if (existing != null) {
        edges.delete(key);
        return existing;
    }
    return undefined;
};

export const get_graph_edge = (from_id: string, to_id: string): GraphEdge | undefined =>
    edges.get(`${from_id}${edge_key_separator}${to_id}`);

export const parse_graph_edge_key = parse_edge_key;
