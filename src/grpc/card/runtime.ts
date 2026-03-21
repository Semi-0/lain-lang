/**
 * Runtime lifecycle for card cells and connector propagators.
 * Side-effect layer that realizes structural graph changes.
 */
import { Either } from "effect";
import { Cell, cell_id, construct_cell, get_base_value, inspect_content, inspect_strongest, is_contradiction, is_disposed, is_nothing } from "ppropogator";
import { trace_card_runtime_io } from "../util/tracer.js";
import { cell_strongest, cell_strongest_base_value, dispose_cell } from "ppropogator/Cell/Cell";
import { dispose_propagator, type Propagator } from "ppropogator/Propagator/Propagator";
import { LexicalEnvironment } from "../../../compiler/env/env.js";
import { card_connector_constructor_cell, internal_cell_above, internal_cell_below, internal_cell_getter, internal_cell_left, internal_cell_right, internal_cell_this, p_construct_card_cell, p_emit_card_internal_updates_to_runtime, compile_internal_network, no_echo_card_io, compile_internal_network_precise, get_local_env } from "./schema.js";
import { p_reactive_dispatch, source_constant_cell, update_source_cell } from "ppropogator/DataTypes/PremisesSource";
import { execute_all_tasks_sequential, get_current_scheduler } from "ppropogator/Shared/Scheduler/Scheduler";
import { bi_sync } from "ppropogator/Propagator/BuiltInProps";
import { construct_vector_clock, get_vector_clock_layer, is_reactive_value, is_vector_clock, vector_clock_get_source_direct, vector_clock_layer } from "ppropogator/AdvanceReactivity/vector_clock";
import { type LayeredObject } from "sando-layer/Basic/LayeredObject";
import { compound_tell } from "ppropogator/Helper/UI";
import { is_equal } from "generic-handler/built_in_generics/generic_arithmetic.js";
import { update_specialized_reactive_value } from "../better_runtime.js";
import {
    connector_key_separator,
    make_connector_key,
    make_connector_key_from_ids,
} from "./connector_key.js";

const connector_storage = new Map<string, Propagator>();
const internal_network_storage = new Map<string, Propagator>();
const card_storage = new Map<string, Cell<unknown>>();
const updater_storage = new Map<string, Cell<unknown>>();
const this_cell_storage = new Map<string, Cell<unknown>>();
const compile_source_storage = new Map<string, Cell<unknown>>();
const compile_timestamp_storage = new Map<string, number>();

// const source = source_cell("user_inputs")

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

const get_or_create_card_compile_source = (id: string): Cell<unknown> => {
    const existing = compile_source_storage.get(id);
    if (existing != null) {
        return existing;
    }

    const source = source_constant_cell(`card-compile:${id}`);
    compile_source_storage.set(id, source);
    return source;
};

const refresh_card_neighbor_clocks = (id: string, card: Cell<unknown>): void => {
    const neighbor_slots = [
        { slot: "left", cell: internal_cell_left(card) },
        { slot: "right", cell: internal_cell_right(card) },
        { slot: "above", cell: internal_cell_above(card) },
        { slot: "below", cell: internal_cell_below(card) },
    ];

    for (const { slot, cell } of neighbor_slots) {
        const strongest = cell_strongest(cell);
        if (
            strongest == null ||
            is_nothing(strongest) ||
            is_contradiction(strongest) ||
            is_disposed(strongest)
        ) {
            continue;
        }

        update_specialized_reactive_value(cell, `${id}:${slot}`, get_base_value(strongest));
    }
};

const refresh_all_card_neighbor_clocks = (): void => {
    for (const [id, card] of card_storage.entries()) {
        refresh_card_neighbor_clocks(id, card);
    }
};

export const runtime_add_card = (id: string): Cell<unknown> => {
    // init card 
    const card = construct_cell("card", id) as Cell<unknown>;
    p_construct_card_cell(id)(card);

    // init card io
    const updater = construct_cell("updater" + id) as Cell<unknown>;
    const emitter = construct_cell("emitter" + id) as Cell<unknown>;
    const internal_this = internal_cell_this(card);


    no_echo_card_io(internal_this, updater, emitter);
  
    this_cell_storage.set(id, internal_this);

    // bind outputs
    p_emit_card_internal_updates_to_runtime(id)(emitter);
    
    // store card and update
    card_storage.set(id, card);
    updater_storage.set(id, updater);

    // trace
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

    // Rebuilds need the latest ::this value before compiling, and disposal is deferred
    // until the scheduler cleanup phase. Flush both edges explicitly around the swap.
    execute_all_tasks_sequential(console.error);

    const has_old_network = internal_network_storage.has(id);
    if (has_old_network) {
        dispose_card_internal_network_io(id);
        execute_all_tasks_sequential(console.error);
        trace_card_runtime_io("build_card_dispose_old_internal_network", { id });
    }

    const source_cell = get_or_create_card_compile_source(id);
    const compile_once = () => {
        const timestamp = compile_timestamp_storage.get(id) ?? 0;

        const internal_network = compile_internal_network_precise(internal_cell_this(card), get_local_env(env, card), source_cell, timestamp);
        internal_network_storage.set(id, internal_network);
        compile_timestamp_storage.set(id, timestamp + 1);
    };

    compile_once();
    // refresh_card_neighbor_clocks(id, card);
    execute_all_tasks_sequential(console.error);

    trace_card_runtime_io("build_card", { id });
    return card;
};



export const runtime_update_card = (id: string, current: unknown): { updated: boolean } => {
    const card = runtime_get_card(id);
    if (card == null) {
        return { updated: false };
    }

    // Run execute before reading so bi_sync propagates to a fresh accessor (cache off).
    const updater = updater_storage.get(id);
    if (updater == null) {
        return { updated: false };
    }

    const internal_this = this_cell_storage.get(id);
    if (internal_this == null) {
        return { updated: false };
    }

    const previous = cell_strongest(internal_this) as LayeredObject<any>;
   
    if (is_equal(get_base_value(previous), get_base_value(current))) {
        return { updated: false };
    }
    else{
    // else {
    //     update_source_cell(updater, current)
    // }
        update_specialized_reactive_value(updater, id, current)

        trace_card_runtime_io("update_card", { id, value: current });
        return { updated: true };
    }
};

export const runtime_remove_card = (id: string): void => {
    const card = card_storage.get(id);
    if (card == null) {
        trace_card_runtime_io("remove_card_error", { id, reason: "not_found" });
        console.error("Card not found", id);
        return;
    }
    dispose_card_internal_network_io(id);
    card_storage.delete(id);
    compile_source_storage.delete(id);
    compile_timestamp_storage.delete(id);
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
