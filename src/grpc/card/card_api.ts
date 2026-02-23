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

import { connect_cards } from "./storage.js";

/** Alias for connect_cards. */
export const attach_cards = connect_cards;
