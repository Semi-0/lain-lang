/**
 * Runtime lifecycle for card cells and connector propagators.
 * Side-effect layer that realizes structural graph changes.
 */
import { Either } from "effect";
import { Cell, cell_id, construct_cell } from "ppropogator";
import { dispose_cell } from "ppropogator/Cell/Cell";
import { dispose_propagator, type Propagator } from "ppropogator/Propagator/Propagator";
import { LexicalEnvironment } from "../../../compiler/env/env.js";
import { card_connector_constructor_cell, internal_build_card, internal_cell_getter, internal_cell_this } from "./schema.js";

const connector_key_separator = "!!*!!";
const make_connector_key_from_ids = (cardA_id: string, cardB_id: string) =>
    `${cardA_id}${connector_key_separator}${cardB_id}`;
const make_connector_key = (cardA: Cell<unknown>, cardB: Cell<unknown>) =>
    make_connector_key_from_ids(cell_id(cardA), cell_id(cardB));

const connector_storage = new Map<string, Propagator>();
const card_storage = new Map<string, Cell<unknown>>();

const parse_connector_key = (key: string) => {
    const parts = key.split(connector_key_separator);
    return {
        cardA_key: parts[0] ?? "",
        cardB_key: parts.slice(1).join(connector_key_separator) || "",
    };
};

export const runtime_add_card = (id: string): Cell<unknown> => {
    const card = construct_cell("card", id) as Cell<unknown>;
    card_storage.set(id, card);
    return card;
};

export const runtime_get_card = (id: string): Cell<unknown> | undefined =>
    card_storage.get(id);

export const runtime_build_card = (env: LexicalEnvironment) => (id: string): Cell<unknown> => {
    const card = internal_build_card(env)(id);
    card_storage.set(id, card);
    return card;
};

export const runtime_remove_card = (id: string): void => {
    const card = card_storage.get(id);
    if (card == null) {
        console.error("Card not found", id);
        return;
    }
    dispose_cell(card);
    card_storage.delete(id);
};

export const runtime_connect_cards = (
    cardA: Cell<unknown>,
    cardB: Cell<unknown>,
    connector_keyA: string,
    connector_keyB: string
): Either.Either<void, never> => {
    const key = make_connector_key(cardA, cardB);
    if (connector_storage.has(key)) {
        return Either.right(undefined as void);
    }
    const connector_keyA_cell = internal_cell_getter(connector_keyA)(cardA);
    const connector_keyB_cell = internal_cell_getter(connector_keyB)(cardB);
    const cardAthis = internal_cell_this(cardA);
    const cardBthis = internal_cell_this(cardB);
    const connector = card_connector_constructor_cell(connector_keyB_cell, connector_keyA_cell)(cardAthis, cardBthis);
    connector_storage.set(key, connector);
    return Either.right(undefined as void);
};

export const runtime_detach_cards_by_key = (
    cardA_key: string,
    cardB_key: string
): Either.Either<void, string> => {
    const connector_key = make_connector_key_from_ids(cardA_key, cardB_key);
    const connector = connector_storage.get(connector_key);
    if (connector == null) {
        return Either.left(`Connector not found for cards ${cardA_key} and ${cardB_key}`);
    }
    dispose_propagator(connector);
    connector_storage.delete(connector_key);
    return Either.right(undefined as void);
};

export const runtime_detach_cards = (
    cardA: Cell<unknown>,
    cardB: Cell<unknown>
): Either.Either<void, string> =>
    runtime_detach_cards_by_key(cell_id(cardA), cell_id(cardB));

export const runtime_detach_incident_connectors = (id: string): void => {
    connector_storage.forEach((_, key) => {
        const { cardA_key, cardB_key } = parse_connector_key(key);
        if (cardA_key === id || cardB_key === id) {
            runtime_detach_cards_by_key(cardA_key, cardB_key);
        }
    });
};
