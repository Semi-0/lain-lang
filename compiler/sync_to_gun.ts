import { encode } from "../DB/serialize/resolve";
import { type IGunInstance } from "gun";
import { cell_id, cell_name, cell_snapshot, cell_strongest, compound_propagator, construct_propagator, is_nothing, observe_all_cells_update } from "ppropogator";
// Type imports separated to avoid Vite export issues
import type { Cell } from "ppropogator/Cell/Cell";
import type { Propagator } from "ppropogator/Propagator/Propagator";
import { decode } from "../DB/serialize/resolve";
import type { interesetedNeighbor } from "ppropogator/Cell/Cell";
import { NeighborType } from "ppropogator/Cell/Cell";
import { is_gun_cell_stored, store_gun_cell } from "../DB/serialize/gun_cell";
import { any_unusable_values, is_unusable_value } from "ppropogator/Cell/CellValue";
import { to_string } from "generic-handler/built_in_generics/generic_conversation";
import { getListenerManager, disposeListeners } from "../DB/serialize/gun_listener_manager";

// todo remote propagator
export const make_cell_neighbor_delta = () => {
    const last = new Map<string, interesetedNeighbor>();

    return (cell: Cell<any>) => {
        const current = cell.getNeighbors();
        const diff: Set<interesetedNeighbor> = new Set();

        for (const [id, currentNeighbor] of current.entries()) {
            const lastNeighbor = last.get(id);
            if (lastNeighbor != undefined) {
                // do nothing
            }
            else {
                diff.add(currentNeighbor)
                last.set(id, currentNeighbor)
            }
        }   

        return diff
    }
}

export const cell_neighbor_delta = make_cell_neighbor_delta();


export const cell_to_gun_cell = (cell: Cell<any>, gun: IGunInstance): Propagator => {

    const representation = gun.get(cell_id(cell))
    const name = cell_name(cell)

    store_gun_cell(cell_id(cell));

    // Create propagator first to track listeners
    const propagator = construct_propagator(
        [cell],
        [],
        () => {
            const strongest = cell_strongest(cell);
            if (is_unusable_value(strongest)) {
                // return;
            }
            else {
                representation
                    .get("cell_strongest")
                    .put(encode(strongest))
            }

            const neighbor_delta = cell_neighbor_delta(cell);

            if (neighbor_delta.size > 0) {
                neighbor_delta.forEach(neighbor => {
                    representation
                        .get("neighbors")
                        .set(encode(neighbor))
                })
            }
        },
        "cell_to_gun_representation"
    );

    // Track listeners on the propagator for cleanup
    const manager = getListenerManager(propagator);

    // Set up content listener with cleanup
    const contentListener = async (data: any, key: string) => {
        if (data === null || (typeof data === 'object' && data._gun_state_initialized)) {
            return;
        }

        const decoded = await decode(data, gun);
        cell.update(decoded)
    };
    manager.registerMapListener(representation.get("content"), contentListener);

    // Set up name (one-time put, no listener needed)
    representation.get("name").put(name);

    // Set up neighbors listener with cleanup
    const neighborsListener = async (data: any, key: string) => {
        if (data === null || (typeof data === 'object' && data._gun_state_initialized)) {
            return;
        }
        
        const decoded = await decode(data, gun);
        if (cell.getNeighbors().has(decoded.propagator.getRelation().get_id())) {
            return;
        }
        else{
            cell.addNeighbor(decoded.propagator, [NeighborType.remote]);
        }
    };
    manager.registerMapListener(representation.get("neighbors"), neighborsListener);

    // Override propagator dispose to close listeners
    const originalDispose = propagator.dispose;
    propagator.dispose = () => {
        disposeListeners(propagator);
        if (originalDispose) {
            originalDispose();
        }
    };

    return propagator;
}


export const sync_runtime_to_gun = (gun: IGunInstance) => {
    const snapshot = cell_snapshot();
    snapshot.forEach(cell => {
        if (!is_gun_cell_stored(cell)) {
            cell_to_gun_cell(cell, gun);
        }
    })


    // update delta
    observe_all_cells_update((cell: Cell<any>) => {
        if (!is_gun_cell_stored(cell)) {
            cell_to_gun_cell(cell, gun);
        }
    })
}
