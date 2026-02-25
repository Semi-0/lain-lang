/**
 * Runtime lifecycle for card cells and connector propagators.
 * Side-effect layer that realizes structural graph changes.
 */
import { Either } from "effect";
import { Cell, cell_id, construct_cell, execute_all_tasks_sequential } from "ppropogator";
import { trace_card_runtime_io } from "../util/tracer.js";
import { cell_strongest_base_value, dispose_cell } from "ppropogator/Cell/Cell";
import { dispose_propagator, type Propagator } from "ppropogator/Propagator/Propagator";
import { LexicalEnvironment } from "../../../compiler/env/env.js";
import { card_connector_constructor_cell, internal_cell_getter, internal_cell_this, p_construct_card_cell, p_emit_card_internal_updates_to_runtime, compile_internal_network, no_echo_card_io } from "./schema.js";
import { p_reactive_dispatch, source_cell, update_source_cell } from "ppropogator/DataTypes/PremisesSource";
import { report_executed_length } from "ppropogator/Shared/Scheduler/Scheduler";
import { bi_sync } from "ppropogator/Propagator/BuiltInProps";

const connector_key_separator = "!!*!!";
const make_connector_key_from_ids = (cardA_id: string, cardB_id: string) =>
    `${cardA_id}${connector_key_separator}${cardB_id}`;
const make_connector_key = (cardA: Cell<unknown>, cardB: Cell<unknown>) =>
    make_connector_key_from_ids(cell_id(cardA), cell_id(cardB));

const connector_storage = new Map<string, Propagator>();
const internal_network_storage = new Map<string, Propagator>();
const card_storage = new Map<string, Cell<unknown>>();
const updater_storage = new Map<string, Cell<unknown>>();


const source = source_cell("user_inputs")

const bind_card_to_user_inputs = (card: Cell<unknown>, source: Cell<unknown>, interface_io: Cell<unknown>): void => {
    const card_this = internal_cell_this(card);

    bi_sync(interface_io, card_this);
    p_reactive_dispatch(source, interface_io);
};

const parse_connector_key = (key: string) => {
    const parts = key.split(connector_key_separator);
    return {
        cardA_key: parts[0] ?? "",
        cardB_key: parts.slice(1).join(connector_key_separator) || "",
    };
};

const dispose_card_internal_network_io = (id: string): boolean => {
    const internal_network = internal_network_storage.get(id);
    if (internal_network == null) {
        return false;
    }
    dispose_propagator(internal_network);
    internal_network_storage.delete(id);
    return true;
};

export const runtime_add_card = (id: string): Cell<unknown> => {
    const card = construct_cell("card", id) as Cell<unknown>;
    p_construct_card_cell(card);

    const updater = construct_cell("updater" + id) as Cell<unknown>;
    const emitter = construct_cell("emitter" + id) as Cell<unknown>;
    const internal_this = internal_cell_this(card);
    no_echo_card_io(internal_this, updater, emitter);

    
    // const interface_io = construct_cell("interface_io" + id) as Cell<unknown>;
    bind_card_to_user_inputs(card, source, updater);
    // because interface io would receive updates whenever it gets a new updates
    p_emit_card_internal_updates_to_runtime(id)(emitter);
    

    card_storage.set(id, card);
    updater_storage.set(id, updater);
    trace_card_runtime_io("add_card", { id });
    return card;
};

export const runtime_get_card = (id: string): Cell<unknown> | undefined =>
    card_storage.get(id);


export const runtime_build_card = (env: LexicalEnvironment) => (id: string): Cell<unknown> => {
    const card = runtime_get_card(id);
    if (card == null) {
        trace_card_runtime_io("build_card_error", { id, reason: "not_found" });
        console.error("Card not found", id);
        return undefined as unknown as Cell<unknown>;
    }

    const has_old_network = dispose_card_internal_network_io(id);
    if (has_old_network) {
        execute_all_tasks_sequential(console.error);
        trace_card_runtime_io("build_card_dispose_old_internal_network", { id });
    }

    const internal_network = compile_internal_network(card, env);
    internal_network_storage.set(id, internal_network);

    execute_all_tasks_sequential(console.error);
    trace_card_runtime_io("build_card", { id, rebuilt: has_old_network });
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

    // Run execute before reading so bi_sync propagates to a fresh accessor (cache off).
    const interface_io = updater_storage.get(id);
    if (interface_io == null) {
        return { updated: false };
    }

    update_source_cell(source, new Map([[interface_io, value]]));
    execute_all_tasks_sequential(console.error);

    trace_card_runtime_io("update_card", { id, value });
    return { updated: true };
};

export const runtime_remove_card = (id: string): void => {
    const card = card_storage.get(id);
    if (card == null) {
        trace_card_runtime_io("remove_card_error", { id, reason: "not_found" });
        console.error("Card not found", id);
        return;
    }
    dispose_card_internal_network_io(id);
    dispose_cell(card);
    card_storage.delete(id);
    // source_this_cell_storage.delete(id);
    trace_card_runtime_io("remove_card", { id });
};

export const runtime_connect_cards = (
    cardA: Cell<unknown>,
    cardB: Cell<unknown>,
    connector_keyA: string,
    connector_keyB: string
): Either.Either<void, never> => {
    const key = make_connector_key(cardA, cardB);
    const idA = cell_id(cardA);
    const idB = cell_id(cardB);

    if (connector_storage.has(key)) {
        trace_card_runtime_io("connect_cards_skip", { cardA: idA, cardB: idB, reason: "already_connected" });
        return Either.right(undefined as void);
    }

    const connector_keyA_cell = internal_cell_getter(connector_keyA)(cardA);
    const connector_keyB_cell = internal_cell_getter(connector_keyB)(cardB);
    const cardAthis = internal_cell_this(cardA);
    const cardBthis = internal_cell_this(cardB);
    const connector = card_connector_constructor_cell(
        connector_keyB_cell, 
        connector_keyA_cell
    )(
        cardAthis, 
        cardBthis
    );
    
    connector_storage.set(key, connector);
    execute_all_tasks_sequential(console.error);
    trace_card_runtime_io("connect_cards", { cardA: idA, cardB: idB, connector_keyA, connector_keyB });
    return Either.right(undefined as void);
};

export const runtime_detach_cards_by_key = (
    cardA_key: string,
    cardB_key: string
): Either.Either<void, string> => {
    const connector_key = make_connector_key_from_ids(cardA_key, cardB_key);
    const connector = connector_storage.get(connector_key);
    if (connector == null) {
        trace_card_runtime_io("detach_cards_error", { cardA: cardA_key, cardB: cardB_key, reason: "connector_not_found" });
        return Either.left(`Connector not found for cards ${cardA_key} and ${cardB_key}`);
    }
    dispose_propagator(connector);
    connector_storage.delete(connector_key);
    trace_card_runtime_io("detach_cards", { cardA: cardA_key, cardB: cardB_key });
    return Either.right(undefined as void);
};

export const runtime_detach_cards = (
    cardA: Cell<unknown>,
    cardB: Cell<unknown>
): Either.Either<void, string> =>
    runtime_detach_cards_by_key(cell_id(cardA), cell_id(cardB));

export const runtime_detach_incident_connectors = (id: string): void => {
    let count = 0;
    connector_storage.forEach((_, key) => {
        const { cardA_key, cardB_key } = parse_connector_key(key);
        if (cardA_key === id || cardB_key === id) {
            count++;
            runtime_detach_cards_by_key(cardA_key, cardB_key);
        }
    });
    if (count > 0) {
        trace_card_runtime_io("detach_incident_connectors", { cardId: id, count });
    }
};
