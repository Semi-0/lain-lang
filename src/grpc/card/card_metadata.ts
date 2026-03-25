import { Cell, cell_strongest, construct_cell, execute_all_tasks_sequential, get_base_value, Propagator } from "ppropogator";
import { update_cell } from "ppropogator/Cell/Cell";
import { source_constant_cell } from "ppropogator/DataTypes/PremisesSource";
import {
    card_connector_constructor_cell,
    compile_card_internal_code,
    compile_internal_network_precise,
    extends_local_environment,
    get_local_env,
    internal_cell_connector_above,
    internal_cell_connector_below,
    internal_cell_connector_left,
    internal_cell_connector_right,
    internal_cell_connector_this,
    no_echo_card_io,
    p_emit_card_internal_updates_to_runtime,
    slot_above,
    slot_below,
    slot_left,
    slot_right,
    slot_this,
} from "./schema";
import { compound_propagator, dispose_propagator } from "ppropogator/Propagator/Propagator";
import { LexicalEnvironment } from "../../../compiler/env/env";
import { LayeredObject } from "sando-layer/Basic/LayeredObject";
import { is_equal } from "generic-handler/built_in_generics/generic_arithmetic";
import { update_specialized_reactive_value } from "../better_runtime";
import { to_string } from "generic-handler/built_in_generics/generic_conversation";
import { card_header, make_name } from "../../../compiler/naming";

type CardMetadata = {
    id : string;
    card : Cell<any>;
    tracking_internal_cells: Map<string, Cell<any>>;
    tracking_propagators: Map<string, Propagator>;
    compile_source: Cell<any>
    compile_timestamp: number;
    local_env: import("../../../compiler/env").LexicalEnvironment | null;
}

const card_metadata_storage = new Map<string, CardMetadata>();

export const remove_card_metadata = (id: string) => {
    card_metadata_storage.delete(id);
}

export const get_card_metadata = (id: string): CardMetadata | undefined => {
    return card_metadata_storage.get(id);
}

export const guarantee_get_card_metadata = (id: string): CardMetadata => {
    const metadata = get_card_metadata(id);
    if (metadata == undefined) {
        throw new Error(`Card metadata not found for ${id}`);
    }
    return metadata;
}


export const set_card_metadata = (id: string, metadata: CardMetadata) => {
    card_metadata_storage.set(id, metadata);
}

export const clear_card_metadata = () => {
    card_metadata_storage.clear();
};

/**
 * Wires slot cells into the card dict via `c_dict_accessor` (see `Dict.ts`).
 * Requires `card` to already carry a `Map` strongest (e.g. empty `new Map()`): inner
 * `c_map_accessor` does not run while the container is `the_nothing`, so the map never installs.
 */
export const unfold_card_neighbor_network = (
    card: Cell<any>,
    this_cell: Cell<any>,
    left_cell: Cell<any>,
    right_cell: Cell<any>,
    above_cell: Cell<any>,
    below_cell: Cell<any>,
) =>
    compound_propagator(
        [],
        [this_cell, left_cell, right_cell, above_cell, below_cell, card],
        () => {
            internal_cell_connector_this(card, this_cell);
            internal_cell_connector_left(card, left_cell);
            internal_cell_connector_right(card, right_cell);
            internal_cell_connector_above(card, above_cell);
            internal_cell_connector_below(card, below_cell);
        },
        "unfold_card_internal_network"
    );

export const tracked_apply_propagator = (tracker: Map<string, Propagator>) =>
    (name: string, propagator_constructor: (...cells: Cell<any>[]) => Propagator, args: Cell<any>[]) => {
        const propagator = propagator_constructor(...args);
        tracker.set(name, propagator);
        return propagator;
    };

/**
 * Card root + explicit slot cells, wired by `unfold_card_neighbor_network`.
 * We do not use `p_construct_card_cell` here: that path installs dict wiring via propagators
 * that are not tracked in `tracking_propagators`, so they cannot be disposed with the card.
 * The unfolder and all other card propagators are registered for `card_metadata_remove`.
 */
export const construct_card_metadata = (id: string) => {
    const card = construct_cell(make_name([card_header, id])) as Cell<unknown>;
    // update_cell(card, new Map());
    // execute_all_tasks_sequential(console.error);

    const compile_source = source_constant_cell(`card-compile:${id}`) as Cell<unknown>;
    const compile_timestamp = 0;

    const tracking_internal_cells = new Map<string, Cell<any>>();
    const tracking_propagators = new Map<string, Propagator>();

    const tracked_cell_construct = (name: string) => {
        const cell = construct_cell(name) as Cell<any>;
        tracking_internal_cells.set(name, cell);
        return cell;
    };

    const tracked_propagator_construct = tracked_apply_propagator(tracking_propagators);

    const card_this = tracked_cell_construct(slot_this);
    const card_left = tracked_cell_construct(slot_left);
    const card_right = tracked_cell_construct(slot_right);
    const card_above = tracked_cell_construct(slot_above);
    const card_below = tracked_cell_construct(slot_below);

    tracked_propagator_construct(
        "unfolder",
        unfold_card_neighbor_network,
        [card, card_this, card_left, card_right, card_above, card_below]
    );

    // Run unfold before io: `compound_propagator` with `[]` inputs still schedules after other work;
    // io must see `ce_dict_accessor` wiring so `internal_cell_*` on `card` matches tracked slots.
    execute_all_tasks_sequential(console.error);

    const updater = construct_cell("updater" + id) as Cell<any>;
    const emitter = construct_cell("emitter" + id) as Cell<any>;
    tracking_internal_cells.set("updater", updater);
    tracking_internal_cells.set("emitter", emitter);

    tracked_propagator_construct(
        "io_propagator",
        no_echo_card_io,
        [card_this, updater, emitter]
    );
    tracked_propagator_construct(
        "emitter_propagator",
        p_emit_card_internal_updates_to_runtime(id),
        [card_this]
    );

    execute_all_tasks_sequential(console.error);

    const metadata: CardMetadata = {
        id,
        card,
        tracking_internal_cells,
        tracking_propagators,
        compile_source,
        compile_timestamp,
        local_env: null,
    };

    set_card_metadata(id, metadata);
    return metadata;
};

export const guarantee_get = (tracker: Map<string, any>, key: string) => {
    if (tracker.has(key)) {
        return tracker.get(key)!;
    }
    else {
        throw new Error(`Key ${key} not found in tracker: ${to_string(tracker)}`);
    }
}

export const card_metadata_compiled = (metadata: CardMetadata) => {
    return metadata.tracking_propagators.has("compiled_network");
}


// export const compile_internal_network_with_metadata = (
//     metadata: CardMetadata,
//     env: LexicalEnvironment,
// ) => compound_propagator(
//     [env, metadata.card],
//     [],
//     () => {
//         console.log("compiling internal network with metadata");
//         const card_this = guarantee_get(metadata.tracking_internal_cells, slot_this);
//         const card_left = guarantee_get(metadata.tracking_internal_cells, slot_left);
//         const card_right = guarantee_get(metadata.tracking_internal_cells, slot_right);
//         const card_above = guarantee_get(metadata.tracking_internal_cells, slot_above);
//         const card_below = guarantee_get(metadata.tracking_internal_cells, slot_below);
//         // so 7b fails exactly happened when we try to 
//         // GC local environment
//         // but why?
//         const local_env = extends_local_environment(
//             env,
//             [
//                 [slot_this, card_this],
//                 [slot_left, card_left],
//                 [slot_right, card_right],
//                 [slot_above, card_above],
//                 [slot_below, card_below],
//             ]
//         )
//         compile_card_internal_code(
//             card_this,
//             local_env,
//             metadata.compile_source,
//             metadata.compile_timestamp
//         )

//     },
//     "compile_internal_network_with_metadata"
// )



export const card_metadata_build = (env: LexicalEnvironment, metadata: CardMetadata) => {

    if (card_metadata_compiled(metadata)) {
        dispose_propagator(metadata.tracking_propagators.get("compiled_network")!);
        // Flush: cascade disposes compiled_network → cc_prop → apply_prim_prop → lookup propagators.
        // After this, old local_env's only remaining neighbor is the selective_sync propagator.
        execute_all_tasks_sequential(console.error);
    }

    // Dispose the selective_sync propagator for the old local_env (not in the compiled_network cascade).
    // After the cascade above, local_env's only remaining neighbors are propagators that have it as input
    // (i.e. selective_sync). Disposing them allows local_env to be GC'd by the scheduler.
    if (metadata.local_env) {
        const old_local_env = metadata.local_env;
        old_local_env.getNeighbors().forEach((neighbor) => {
            if (neighbor.propagator != null) {
                dispose_propagator(neighbor.propagator);
            }
        });
        metadata.local_env = null;
    }

    const ts = metadata.compile_timestamp;
    const local_env = get_local_env(env, metadata.card);
    metadata.local_env = local_env;

    const compiled_network = compile_internal_network_precise(
        guarantee_get(metadata.tracking_internal_cells, slot_this),
        local_env,
        metadata.compile_source,
        ts
    );
    metadata.tracking_propagators.set("compiled_network", compiled_network);
    metadata.compile_timestamp = ts + 1;

    execute_all_tasks_sequential(console.error);
    return metadata;
};


export const card_metadata_update = (
    metadata: CardMetadata,
    current: any
): { metadata: CardMetadata; updated: boolean } => {
    const this_cell = guarantee_get(metadata.tracking_internal_cells, slot_this);
    const updater = guarantee_get(metadata.tracking_internal_cells, "updater");
    const previous = cell_strongest(this_cell) as LayeredObject<any>;
    if (is_equal(get_base_value(previous), get_base_value(current))) {
        return { metadata, updated: false };
    }
    update_specialized_reactive_value(updater, metadata.id, current);
    return { metadata, updated: true };
};

export const card_metadata_connect = (
    metadataA: CardMetadata,
    metadataB: CardMetadata,
    connector_keyA: string,
    connector_keyB: string,
) => {
    const forwardKey = `${metadataA.id}->${metadataB.id}`;
    const reverseKey = `${metadataB.id}->${metadataA.id}`;
    const existing = metadataA.tracking_propagators.get(forwardKey);
    if (existing !== undefined) {
        dispose_propagator(existing);
        metadataA.tracking_propagators.delete(forwardKey);
        metadataB.tracking_propagators.delete(reverseKey);
    }

    const connector_keyA_cell = guarantee_get(metadataA.tracking_internal_cells, connector_keyA);
    const connector_keyB_cell = guarantee_get(metadataB.tracking_internal_cells, connector_keyB);
    const cardAthis = guarantee_get(metadataA.tracking_internal_cells, slot_this);
    const cardBthis = guarantee_get(metadataB.tracking_internal_cells, slot_this);

    const connector = card_connector_constructor_cell(
        connector_keyB_cell,
        connector_keyA_cell
    )(
        cardAthis,
        cardBthis
    );

    metadataA.tracking_propagators.set(metadataA.id + "->" + metadataB.id, connector);
    metadataB.tracking_propagators.set(metadataB.id + "->" + metadataA.id, connector);
  
}

export const card_metadata_remove = (metadata: CardMetadata) => {
    metadata.tracking_propagators.forEach((propagator, key) => {
        dispose_propagator(propagator);
    });

    remove_card_metadata(metadata.id);
}

export const card_metadata_detach = (metadataA: CardMetadata, metadataB: CardMetadata) => {
    const connector = metadataA.tracking_propagators.get(metadataA.id + "->" + metadataB.id)
    if (connector == undefined) {
        throw new Error(`Connector not found for cards ${metadataA.id} and ${metadataB.id}`);
    }
    dispose_propagator(connector);
    metadataA.tracking_propagators.delete(metadataA.id + "->" + metadataB.id);
    metadataB.tracking_propagators.delete(metadataB.id + "->" + metadataA.id);
}
