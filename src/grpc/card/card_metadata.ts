import { Cell, cell_strongest, construct_cell, execute_all_tasks_sequential, get_base_value, Propagator } from "ppropogator";
import { update_cell } from "ppropogator/Cell/Cell";
import { source_constant_cell, update_source_cell } from "ppropogator/DataTypes/PremisesSource";
import { create_observer_link, p_sync_to_link } from "ppropogator/DataTypes/ObserverCarriedCell";
import {
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
import { card_header, create_card_cell_name, make_name } from "../../../compiler/naming";

type CardMetadata = {
    id : string;
    card : Cell<any>;
    tracking_internal_cells: Map<string, Cell<any>>;
    tracking_propagators: Map<string, Propagator>;
    connector_links: Map<string, Cell<any>[]>;
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
    const card = construct_cell(make_name([card_header, id]), id) as Cell<unknown>;
    // initialize the card with first seed, for some reason 
    // this is working and we should not touch it
    update_cell(card, new Map());
    // execute_all_tasks_sequential(console.error);

    const compile_source = source_constant_cell(`card-compile:${id}`) as Cell<unknown>;
    const compile_timestamp = 0;

    const tracking_internal_cells = new Map<string, Cell<any>>();
    const tracking_propagators = new Map<string, Propagator>();

    const tracked_cell_construct = (key: string, cellName?: string) => {
        const cell = construct_cell(cellName ?? key) as Cell<any>;
        tracking_internal_cells.set(key, cell);
        return cell;
    };

    const tracked_propagator_construct = tracked_apply_propagator(tracking_propagators);

    const card_this = tracked_cell_construct(slot_this, create_card_cell_name(id, slot_this));
    const card_left = tracked_cell_construct(slot_left, create_card_cell_name(id, slot_left));
    const card_right = tracked_cell_construct(slot_right, create_card_cell_name(id, slot_right));
    const card_above = tracked_cell_construct(slot_above, create_card_cell_name(id, slot_above));
    const card_below = tracked_cell_construct(slot_below, create_card_cell_name(id, slot_below));

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
        connector_links: new Map(),
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

    // Clear any previous connection on this slot pair
    const existing_links = metadataA.connector_links.get(forwardKey);
    if (existing_links !== undefined) {
        const dummy = construct_cell(`disconnected:${forwardKey}:prev`);
        const disconnected_link = create_observer_link(dummy);
        for (const link of existing_links) {
            update_source_cell(link, disconnected_link);
        }
        metadataA.connector_links.delete(forwardKey);
        metadataB.connector_links.delete(reverseKey);
    }

    const kA    = guarantee_get(metadataA.tracking_internal_cells, connector_keyA); // A.::right
    const kB    = guarantee_get(metadataB.tracking_internal_cells, connector_keyB); // B.::left
    const Athis = guarantee_get(metadataA.tracking_internal_cells, slot_this);
    const Bthis = guarantee_get(metadataB.tracking_internal_cells, slot_this);

    // One source_constant_cell per sync direction — updateable via vector clock (substitutes, not merges)
    const link_kA_to_Bthis  = source_constant_cell(`link:${forwardKey}:kA→Bthis`);
    const link_Bthis_to_kA  = source_constant_cell(`link:${forwardKey}:Bthis→kA`);
    const link_kB_to_Athis  = source_constant_cell(`link:${forwardKey}:kB→Athis`);
    const link_Athis_to_kB  = source_constant_cell(`link:${forwardKey}:Athis→kB`);

    // Permanent propagators — no-ops when link is the_nothing, active when link resolves to a cell
    p_sync_to_link(kA,    link_kA_to_Bthis);
    p_sync_to_link(Bthis, link_Bthis_to_kA);
    p_sync_to_link(kB,    link_kB_to_Athis);
    p_sync_to_link(Athis, link_Athis_to_kB);

    // Activate: point each link at its target
    update_source_cell(link_kA_to_Bthis,  create_observer_link(Bthis));
    update_source_cell(link_Bthis_to_kA,  create_observer_link(kA));
    update_source_cell(link_kB_to_Athis,  create_observer_link(Athis));
    update_source_cell(link_Athis_to_kB,  create_observer_link(kB));

    const links = [link_kA_to_Bthis, link_Bthis_to_kA, link_kB_to_Athis, link_Athis_to_kB];
    metadataA.connector_links.set(forwardKey, links);
    metadataB.connector_links.set(reverseKey, links);
}

export const card_metadata_remove = (metadata: CardMetadata) => {
    metadata.tracking_propagators.forEach((propagator, key) => {
        dispose_propagator(propagator);
    });
    metadata.connector_links.forEach((links, key) => {
        const dummy = construct_cell(`disconnected:${key}`);
        const disconnected_link = create_observer_link(dummy);
        for (const link of links) {
            update_source_cell(link, disconnected_link);
        }
    });
    metadata.connector_links.clear();

    remove_card_metadata(metadata.id);
}

export const card_metadata_detach = (metadataA: CardMetadata, metadataB: CardMetadata) => {
    const forwardKey = `${metadataA.id}->${metadataB.id}`;
    const reverseKey = `${metadataB.id}->${metadataA.id}`;
    const links = metadataA.connector_links.get(forwardKey);
    if (links === undefined) {
        throw new Error(`Connector not found for cards ${metadataA.id} and ${metadataB.id}`);
    }
    // Redirect every link to a fresh throwaway cell so p_sync_to_link propagators push
    // harmlessly into the void instead of into the old neighbor's slots.
    // (update_source_cell requires a proper LayeredObject value; the_nothing is a plain string
    // that doesn't advance the vector clock, so pointing at a dummy cell is the safe alternative.)
    const dummy = construct_cell(`disconnected:${forwardKey}`);
    const disconnected_link = create_observer_link(dummy);
    for (const link of links) {
        update_source_cell(link, disconnected_link);
    }
    metadataA.connector_links.delete(forwardKey);
    metadataB.connector_links.delete(reverseKey);
}
