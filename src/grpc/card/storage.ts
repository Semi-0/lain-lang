/**
 * Card storage: add_card, remove_card, connect_cards (attach), detach_cards.
 * Internal module – prefer importing from card_api or card/index.
 */
import { Either } from "effect";
import { Cell, cell_id, construct_cell } from "ppropogator";
import { dispose_propagator, type Propagator } from "ppropogator/Propagator/Propagator";
import { card_connector_constructor, card_connector_constructor_cell, internal_build_card, internal_cell_above, internal_cell_getter, internal_cell_this } from "./schema.js";
import { LexicalEnvironment } from "../../../compiler/env/env.js";
import { dispose_cell } from "ppropogator/Cell/Cell";

const connector_storage = new Map<string, Propagator>();
const card_storage = new Map<string, Cell<unknown>>();

const make_connector_key_from_ids = (cardA_id: string, cardB_id: string) =>
    `${cardA_id}${connector_key_separator}${cardB_id}`;

const connector_key_separator = "!!*!!";

const make_connector_key = (cardA: Cell<unknown>, cardB: Cell<unknown>) =>
    cell_id(cardA) + connector_key_separator + cell_id(cardB);

const parse_connector_key = (key: string) => {
    const parts = key.split(connector_key_separator);
    return {
        cardA_key: parts[0] ?? "",
        cardB_key: parts.slice(1).join(connector_key_separator) || "",
    };
};

const remove_connector_key = (key: string) => {
    connector_storage.delete(key);
};

export const add_card = (id: string): Cell<unknown> => {
    const card = construct_cell("card", id) as Cell<unknown>;
    card_storage.set(id, card);
    return card;
};

export const build_card = (env: LexicalEnvironment) => (id: string): Cell<unknown> => {
    const card = internal_build_card(env)(id);
    card_storage.set(id, card);
    return card;
};

export const remove_card = (id: string): void => {
    const card = card_storage.get(id);
    if (card != null) {
        connector_storage.forEach((_, key) => {
            const { cardA_key, cardB_key } = parse_connector_key(key);
            if (cardA_key === id || cardB_key === id) {
                console.log("detaching connector", cardA_key, cardB_key);
                detach_cards_by_key(cardA_key, cardB_key);
            }
            else {
                console.log("connector not found", cardA_key, cardB_key);
            }
        });
        dispose_cell(card)
        // card.dispose();
        card_storage.delete(id);
    }
    else {
        console.error("Card not found", id);
    }
};

export const connect_cards = (
    cardA: Cell<unknown>,
    cardB: Cell<unknown>,
    connector_keyA: string,
    connector_keyB: string
): Either.Either<void, never> => {
    const connector_keyA_cell = internal_cell_getter(connector_keyA)(cardA);
    const connector_keyB_cell = internal_cell_getter(connector_keyB)(cardB);
    const cardAthis = internal_cell_this(cardA);
    const cardBthis = internal_cell_this(cardB);
    const connector = card_connector_constructor_cell(connector_keyB_cell, connector_keyA_cell)(cardAthis, cardBthis);
    connector_storage.set(make_connector_key(cardA, cardB), connector);
    return Either.right(undefined as void);
};

export const detach_cards_by_key = (
    cardA_key: string,
    cardB_key: string
): Either.Either<void, string> => {
    const connector_key = make_connector_key_from_ids(cardA_key, cardB_key);
    const connector = connector_storage.get(connector_key);
    if (connector != null) {
        dispose_propagator(connector);
        remove_connector_key(connector_key);
        return Either.right(undefined as void);
    }
    return Either.left(`Connector not found for cards ${cardA_key} and ${cardB_key}`);
};

export const detach_cards = (
    cardA: Cell<unknown>,
    cardB: Cell<unknown>
): Either.Either<void, string> =>
    detach_cards_by_key(cell_id(cardA), cell_id(cardB));
