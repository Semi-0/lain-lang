/**
 * @deprecated Legacy runtime + graph storage for card lifecycle. Prefer `card_lifecycle.ts` /
 * `card_api.ts` (metadata-backed API). This module is kept for reference or gradual migration only.
 *
 * Card storage: add_card, remove_card, connect_cards (attach), detach_cards.
 */
import { Either } from "effect";
import { LexicalEnvironment } from "../../../../compiler/env/env.js";
import { SlotName, add_graph_card, get_graph_edge, remove_graph_card, remove_graph_edge, upsert_graph_edge } from "../graph.js";
import { runtime_add_card, runtime_build_card, runtime_connect_cards, runtime_detach_cards_by_key, runtime_detach_incident_connectors, runtime_get_card, runtime_remove_card, runtime_update_card } from "../runtime.js";
import { card_metadata_build, card_metadata_connect, card_metadata_detach, card_metadata_remove, card_metadata_update, construct_card_metadata, get_card_metadata, guarantee_get_card_metadata } from "../card_metadata.js";

const to_slot_name = (slot: string): SlotName => slot as SlotName;

export const add_card = (id: string): string => {
    // construct_card_metadata(id);
    add_graph_card(id);
    runtime_add_card(id);
    return id;
};

export const build_card = (env: LexicalEnvironment) => (id: string): string => {
    // const metadata = guarantee_get_card_metadata(id);
    // card_metadata_build(env, metadata);
    add_graph_card(id);
    runtime_build_card(env)(id);
    return id;
};

export const update_card = (id: string, value: unknown): { updated: boolean } =>{
    // const metadata = guarantee_get_card_metadata(id);
    // card_metadata_update(metadata, value);
   
    return runtime_update_card(id, value);
}

export const remove_card = (id: string): void => {
    // const metadata = guarantee_get_card_metadata(id);
    // card_metadata_remove(metadata);
    remove_graph_card(id);
    runtime_detach_incident_connectors(id);
    runtime_remove_card(id);
};

export const connect_cards = (
    idA: string,
    idB: string,
    connector_keyA: string,
    connector_keyB: string
): Either.Either<void, string> => {
    const cardA = runtime_get_card(idA);
    const cardB = runtime_get_card(idB);
    if (cardA == null) return Either.left(`Card not found: ${idA}`);
    if (cardB == null) return Either.left(`Card not found: ${idB}`);
    upsert_graph_edge({
        from_id: idA,
        from_slot: to_slot_name(connector_keyA),
        to_id: idB,
        to_slot: to_slot_name(connector_keyB),
    });
    return runtime_connect_cards(cardA, cardB, connector_keyA, connector_keyB);
    // const metadataA = guarantee_get_card_metadata(idA);
    // const metadataB = guarantee_get_card_metadata(idB);
    // card_metadata_connect(metadataA, metadataB, connector_keyA, connector_keyB);
    // return Either.right(undefined as void);
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
    // const metadataA = guarantee_get_card_metadata(cardA_key);
    // const metadataB = guarantee_get_card_metadata(cardB_key);
    // card_metadata_detach(metadataA, metadataB);
    // return Either.right(undefined as void);
};

export const detach_cards = (idA: string, idB: string): Either.Either<void, string> =>
    detach_cards_by_key(idA, idB);
