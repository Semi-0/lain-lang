/**
 * Card API: build, add, remove, connect (attach), detach.
 * Single entry point for card lifecycle operations.
 */
export {
    internal_build_card,
    slot_this,
    slot_left,
    slot_right,
    slot_above,
    slot_below,
    all_slots,
    internal_cell_this,
    internal_cell_left,
    internal_cell_right,
    internal_cell_above,
    internal_cell_below,
} from "./schema.js";

export {
    build_card,
    add_card,
    remove_card,
    connect_cards,
    detach_cards,
    detach_cards_by_key,
} from "./storage.js";

export type {
    GraphEdge,
    SlotName,
} from "./graph.js";

export {
    add_graph_card,
    get_graph_edge,
    remove_graph_card,
    remove_graph_edge,
    upsert_graph_edge,
} from "./graph.js";

export {
    runtime_add_card,
    runtime_build_card,
    runtime_remove_card,
    runtime_connect_cards,
    runtime_detach_cards,
    runtime_detach_cards_by_key,
    runtime_detach_incident_connectors,
    runtime_get_card,
} from "./runtime.js";

export {
    emit_runtime_card_output_io,
    subscribe_runtime_card_output,
    type RuntimeCardOutputEvent,
} from "../bridge/card_runtime_events.js";

import { connect_cards } from "./storage.js";

/** Alias for connect_cards. */
export const attach_cards = connect_cards;
