/**
 * Runtime lifecycle for card cells and connector propagators.
 * Side-effect layer that realizes structural graph changes.
 */
import { Either } from "effect";
import { Cell, cell_id, construct_cell } from "ppropogator";
import { cell_strongest_base_value, dispose_cell } from "ppropogator/Cell/Cell";
import { dispose_propagator, type Propagator } from "ppropogator/Propagator/Propagator";
import { LexicalEnvironment } from "../../../compiler/env/env.js";
import { card_connector_constructor_cell, internal_build_card, internal_cell_getter, internal_cell_this } from "./schema.js";
import { p_reactive_dispatch, source_cell, update_source_cell } from "ppropogator/DataTypes/PremisesSource";

const connector_key_separator = "!!*!!";
const make_connector_key_from_ids = (cardA_id: string, cardB_id: string) =>
    `${cardA_id}${connector_key_separator}${cardB_id}`;
const make_connector_key = (cardA: Cell<unknown>, cardB: Cell<unknown>) =>
    make_connector_key_from_ids(cell_id(cardA), cell_id(cardB));

const connector_storage = new Map<string, Propagator>();
const card_storage = new Map<string, Cell<unknown>>();
const source_this_cell_storage = new Map<string, Cell<unknown>>();

const source = source_cell("user_inputs")

const bind_card_to_user_inputs = (id: string, card: Cell<unknown>): void => {
    const card_this = internal_cell_this(card);
    p_reactive_dispatch(source, card_this);
    source_this_cell_storage.set(id, card_this);
};

const parse_connector_key = (key: string) => {
    const parts = key.split(connector_key_separator);
    return {
        cardA_key: parts[0] ?? "",
        cardB_key: parts.slice(1).join(connector_key_separator) || "",
    };
};

export const runtime_add_card = (id: string): Cell<unknown> => {
    const card = construct_cell("card", id) as Cell<unknown>;
    bind_card_to_user_inputs(id, card);
    card_storage.set(id, card);
    return card;
};

export const runtime_get_card = (id: string): Cell<unknown> | undefined =>
    card_storage.get(id);


export const runtime_build_card = (env: LexicalEnvironment) => (id: string): Cell<unknown> => {
    const card = internal_build_card(env)(id);
    bind_card_to_user_inputs(id, card);
    card_storage.set(id, card);
    return card;
};

function value_signature(value: unknown): string {
    if (
        value === null ||
        typeof value === "string" ||
        typeof value === "number" ||
        typeof value === "boolean"
    ) {
        return `${typeof value}:${String(value)}`;
    }
    try {
        return `json:${JSON.stringify(value)}`;
    } catch {
        return `string:${String(value)}`;
    }
}

export const runtime_update_card = (id: string, value: unknown): { updated: boolean } => {
    const card = runtime_get_card(id);
    if (card == null) {
        return { updated: false };
    }

    // this can be optimized if we decide 
    // cell reactive update is idempotent
    const this_cell = internal_cell_this(card);
    const current_value = cell_strongest_base_value(this_cell);
    if (value_signature(current_value) === value_signature(value)) {
        return { updated: false };
    }

    const source_this_cell = source_this_cell_storage.get(id);
    if (source_this_cell == null) {
        return { updated: false };
    }
    update_source_cell(source, new Map([[source_this_cell, value]]));
    return { updated: true };
};

export const runtime_remove_card = (id: string): void => {
    const card = card_storage.get(id);
    if (card == null) {
        console.error("Card not found", id);
        return;
    }
    dispose_cell(card);
    card_storage.delete(id);
    source_this_cell_storage.delete(id);
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
