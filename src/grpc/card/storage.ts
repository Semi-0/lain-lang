/**
 * Card storage: add_card, remove_card, connect_cards (attach), detach_cards.
 * Internal module – prefer importing from card_api or card/index.
 */
import { Either } from "effect";
import { Cell, cell_id } from "ppropogator";
import { LexicalEnvironment } from "../../../compiler/env/env.js";
import { SlotName, add_graph_card, get_graph_edge, remove_graph_card, remove_graph_edge, upsert_graph_edge } from "./graph.js";
import { runtime_add_card, runtime_build_card, runtime_connect_cards, runtime_detach_cards_by_key, runtime_detach_incident_connectors, runtime_remove_card, runtime_update_card } from "./runtime.js";

const to_slot_name = (slot: string): SlotName => slot as SlotName;

export const add_card = (id: string): Cell<unknown> => {
    add_graph_card(id);
    return runtime_add_card(id);
};

export const build_card = (env: LexicalEnvironment) => (id: string): Cell<unknown> => {
    add_graph_card(id);
    return runtime_build_card(env)(id);
};

export const update_card = (id: string, value: unknown): { updated: boolean } =>
    runtime_update_card(id, value);

export const remove_card = (id: string): void => {
    remove_graph_card(id);
    runtime_detach_incident_connectors(id);
    runtime_remove_card(id);
};

export const connect_cards = (
    cardA: Cell<unknown>,
    cardB: Cell<unknown>,
    connector_keyA: string,
    connector_keyB: string
): Either.Either<void, never> => {
    upsert_graph_edge({
        from_id: cell_id(cardA),
        from_slot: to_slot_name(connector_keyA),
        to_id: cell_id(cardB),
        to_slot: to_slot_name(connector_keyB),
    });
    return runtime_connect_cards(cardA, cardB, connector_keyA, connector_keyB);
};

export const detach_cards_by_key = (
    cardA_key: string,
    cardB_key: string
): Either.Either<void, string> => {
    const edge = get_graph_edge(cardA_key, cardB_key);
    if (edge == null) {
        return Either.left(`Connector not found for cards ${cardA_key} and ${cardB_key}`);
    }
    remove_graph_edge(cardA_key, cardB_key);
    return runtime_detach_cards_by_key(edge.from_id, edge.to_id);
};

export const detach_cards = (
    cardA: Cell<unknown>,
    cardB: Cell<unknown>
): Either.Either<void, string> =>
    detach_cards_by_key(cell_id(cardA), cell_id(cardB));
