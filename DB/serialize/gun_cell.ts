import {  construct_neighbor } from "ppropogator/Cell/Cell";
import { make_relation } from "ppropogator/DataTypes/Relation";
import { get_global_parent, propagator_snapshot } from "ppropogator/Shared/PublicState";
import { type interesetedNeighbor as Neighbor } from "ppropogator/Cell/Cell";
import { type CellValue, is_nothing } from "ppropogator/Cell/CellValue";
import { the_nothing } from "ppropogator/Cell/CellValue";
import { handle_contradiction } from "ppropogator/Cell/Cell";
import { NeighborType } from "ppropogator/Cell/Cell";
import { strongest_value } from "ppropogator/Cell/StrongestValue";
import { type Cell } from "ppropogator/Cell/Cell";
import { is_equal } from "generic-handler/built_in_generics/generic_arithmetic";
import { is_contradiction } from "ppropogator/Cell/CellValue";
import { cell_merge } from "ppropogator/Cell/Merge";
import { type Propagator, propagator_id } from "ppropogator/Propagator/Propagator";
import { get_id } from "ppropogator/Shared/Generics";
import { describe } from "ppropogator/Helper/UI";
import { PublicStateCommand } from "ppropogator/Shared/PublicState";
import { set_global_state } from "ppropogator/Shared/PublicState";
import { cell_snapshot } from "ppropogator/Shared/PublicState";
import { the_disposed } from "ppropogator/Cell/CellValue";
import { type IGunInstance } from "gun";
import { gun_db_schema_encode } from "./encode";
import { gun_db_schema_decode } from "./decode";
import { v4 as uuidv4 } from 'uuid';
import { compose } from "generic-handler/built_in_generics/generic_combinator";
import { gun_resolve } from "./gun_resolve";
import { define_generic_procedure_handler, trace_generic_procedure } from "generic-handler/GenericProcedure";
import { is_array } from "generic-handler/built_in_generics/generic_predicates";
import { create_root_state, gun_state, type GunState, is_gun_state, merge_state_with_increment } from "./gun_state";
import { to_string } from "generic-handler/built_in_generics/generic_conversation";
import { log_tracer } from "generic-handler/built_in_generics/generic_debugger";
import { encode, decode } from "./resolve";
export { decode };
import { cell_id, cell_name, id, match_args } from "ppropogator";
import { is_map } from "pmatcher/MatchBuilder";
import { bi_sync } from "ppropogator/Propagator/BuiltInProps";
import { alert_propagator, execute_all_tasks_sequential } from "ppropogator/Shared/Scheduler/Scheduler";
import { getListenerManager, disposeListeners } from "./gun_listener_manager";

// this module over engineered too much
// needs huge refactor!!!!


export function local_has_neighbor(neighbor: Propagator) {
    return propagator_snapshot().some(p => propagator_id(p) === propagator_id(neighbor));
}

// ============================================================================
// COMMON CONFIGURATION TYPE
// ============================================================================

type GunCellHelpers<A> = {
    get_content: () => CellValue<A>;
    get_local_neighbors: () => Map<string, Neighbor>;
    get_strongest: () => CellValue<A>;
    set_strongest: (value: CellValue<A>) => void;
    database: any;
};

type GunCellConfig<A> = {
    onContentUpdate?: (content: CellValue<A>, helpers: GunCellHelpers<A>) => void;
    testContent?: (helpers: GunCellHelpers<A>) => void;
    onUpdate?: (increment: CellValue<A>, setContent: (increment: CellValue<A>) => void, helpers: GunCellHelpers<A>) => void;
};




export function debounce<T extends (...args: any[]) => any>(
    func: T, 
    wait: number
): (...args: Parameters<T>) => void {
    let timeout: any;

    return (...args: Parameters<T>) => {
        // 1. Clear the previous timer if it exists
        if (timeout) {
            clearTimeout(timeout);
        }

        // 2. Set a new timer
        timeout = setTimeout(() => {
            func(...args);
        }, wait);
    };
}




const get_local_neighbors = (neighbors: Map<string, Neighbor>) => {
    return new Map(
        Array.from(neighbors.entries())
            .filter(([id, info]) => local_has_neighbor(info.propagator))
    );
};

// ============================================================================
// SHARED IMPLEMENTATION
// ============================================================================

/**
 * Snapshots for cell state
 */
interface GunCellSnapshots<A> {
    strongest: CellValue<A>;
    content: CellValue<A>;
    neighbors: Map<string, Neighbor>;
    localNeighbors: Map<string, Neighbor>;
}

/**
 * Nodes for Gun.js state
 */
interface GunCellStateNodes {
    contentNode: any;
    neighborsNode: any;
    strongestNode: any;
    contentState?: GunState;
    neighborsState?: GunState;
    strongestState?: GunState;
}

/**
 * Resolve and alert interested propagators
 */
function resolve_and_alert_interested_propagators(
    type: NeighborType,
    neighbors: Map<string, Neighbor>
): void {
    neighbors.forEach((neighbor) => {
        if (neighbor.type.includes(type)) {
            alert_propagator(neighbor.propagator);
        }
    });
}

/**
 * Set up strongest value listener
 */
function setup_strongest_listener<A>(
    strongestNode: any,
    gun: IGunInstance,
    snapshots: GunCellSnapshots<A>,
    logErrors: boolean,
    cellId: string,
    cell: Cell<A>
): void {
    const listener = async (data: any, key?: string) => {
        if (data === undefined || data === null || (typeof data === 'object' && data._gun_state_initialized)) {
            if (logErrors && (data === undefined || data === null)) {
                console.error("[gun_state] strongest on: returning early due to undefined/null");
            }
            return;
        }
        try {
            const decoded = await decode(data, gun);
      
            if (!is_nothing(decoded)) {
                snapshots.strongest = decoded;
                resolve_and_alert_interested_propagators(NeighborType.updated, snapshots.neighbors);
            }
        } catch (error) {
            console.error(`[gun_state] Error decoding strongest value for cell ${cellId}:`, error);
        }
    };
    
    const manager = getListenerManager(cell);
    manager.register(strongestNode, listener);
}

/**
 * Set up content listener with proper cleanup.
 * Uses listener manager to track and close listeners.
 */
function setup_content_listener<A>(
    contentNode: any,
    gun: IGunInstance,
    snapshots: GunCellSnapshots<A>,
    cell: Cell<A>
): void {
    const listener = async (data: any, key: string) => {
        if (data === null || (typeof data === 'object' && data._gun_state_initialized)) {
            return;
        }
        
        const decoded = await decode(data, gun);
        if (is_nothing(decoded)) return;

        if (is_nothing(snapshots.content)) {
            // @ts-ignore
            snapshots.content = [];
            // @ts-ignore
            snapshots.content.push(decoded);
        } 
        else {
            // @ts-ignore
            snapshots.content.push(decoded);
        }
    };
    
    const manager = getListenerManager(cell);
    manager.registerMapListener(contentNode, listener);
}

/**
 * Set up neighbors listener with proper cleanup.
 */
function setup_neighbors_listener<A>(
    neighborsNode: any,
    gun: IGunInstance,
    snapshots: GunCellSnapshots<A>,
    filterLocal: boolean,
    cell: Cell<A>
): void {
    const listener = async (data: any, key: string) => {
        const decoded = await decode(data, gun);
        if (is_nothing(decoded)) return;

        // Decoded neighbor should have 'type' field (from neighbor_type in schema)
        // Handle both 'type' and 'interested_in' for backward compatibility
        const neighborType = decoded.type || decoded.interested_in;
        const neighbor = construct_neighbor(neighborType, decoded.propagator);
        
        snapshots.neighbors.set(get_id(decoded.propagator), neighbor);
        
        if (filterLocal) {
            snapshots.localNeighbors = get_local_neighbors(snapshots.neighbors);
        }
    };
    
    const manager = getListenerManager(cell);
    manager.registerMapListener(neighborsNode, listener);
}

/**
 * Initialize neighbors from database
 */
function initialize_neighbors<A>(
    neighborsNode: any,
    gun: IGunInstance,
    snapshots: GunCellSnapshots<A>,
    filterLocal: boolean
): void {
    const get_neighbors = async () => {
        const neighbors = await decode(neighborsNode, gun);
        if (neighbors instanceof Map) {
            return neighbors;
        } else {
            return new Map();
        }
    };

    get_neighbors().then(async (neighbors) => {
        if (!is_nothing(neighbors)) {
            snapshots.neighbors = neighbors;
            if (filterLocal) {
                snapshots.localNeighbors = get_local_neighbors(neighbors);
            }
        }
    });
}

/**
 * Create state nodes
 */
function create_state_nodes(
    gun: IGunInstance,
    id: string,
    useGunState: boolean
): GunCellStateNodes {
    if (useGunState) {
        // Instance: use gun_state wrapper
        const cellState = gun_state(create_root_state(gun), gun, id, {});
        const contentState = gun_state(cellState, gun, "content");
        const neighborsState = gun_state(cellState, gun, "neighbors");
        const strongestState = gun_state(cellState, gun, "cell_strongest");

        cellState.getNode().on((data: any) => {
            queueMicrotask(() => {
                execute_all_tasks_sequential(console.error);
            });
        })
        
        return {
            contentNode: contentState.getNode(),
            neighborsNode: neighborsState.getNode(),
            strongestNode: strongestState.getNode(),
            contentState,
            neighborsState,
            strongestState,
        };
    } else {
        // Receiver: use direct gun.get()
        return {
            contentNode: gun.get(id).get("content"),
            neighborsNode: gun.get(id).get("neighbors"),
            strongestNode: gun.get(id).get("cell_strongest"),
        };
    }
}

/**
 * Initialize snapshots
 */
function create_snapshots<A>(): GunCellSnapshots<A> {
    return {
        strongest: the_nothing,
        content: the_nothing,
        neighbors: new Map(),
        localNeighbors: new Map(),
    };
}

/**
 * Create set_strongest function
 */
function create_set_strongest<A>(
    stateNodes: GunCellStateNodes,
    snapshots: GunCellSnapshots<A>,
    useGunState: boolean
) {
    return (value: CellValue<A>) => {
        snapshots.strongest = value;
        if (useGunState && stateNodes.strongestState) {
            stateNodes.strongestState.update(encode(value));
        } else {
            stateNodes.strongestNode.put(encode(value));
        }
        resolve_and_alert_interested_propagators(NeighborType.updated, snapshots.neighbors);
    };
}

/**
 * Set up computation logic with proper listener cleanup.
 */
function setup_computation<A>(
    contentNode: any,
    gun: IGunInstance,
    snapshots: GunCellSnapshots<A>,
    setStrongest: (value: CellValue<A>) => void,
    cell: Cell<A>
): void {
    const listener = async (data: any, key: string) => {
        if (data === null || (typeof data === 'object' && data._gun_state_initialized)) {
            return;
        }
        
        const decoded = await decode(data, gun);
        if (is_nothing(decoded)) return;
        
        if (is_nothing(snapshots.content)) {
            // @ts-ignore
            snapshots.content = [];
        }
        // @ts-ignore
        snapshots.content.push(decoded);
        
        const newStrongest = strongest_value(snapshots.content);
        if (!is_equal(newStrongest, snapshots.strongest)) {
            if (is_contradiction(newStrongest)) {
                setStrongest(newStrongest);
                handle_contradiction(cell);
            } else {
                setStrongest(newStrongest);
            }
        }
    };
    
    const manager = getListenerManager(cell);
    manager.registerMapListener(contentNode, listener);
}

/**
 * Create cell object
 */
function create_cell_object<A>(
    relation: ReturnType<typeof make_relation>,
    stateNodes: GunCellStateNodes,
    snapshots: GunCellSnapshots<A>,
    gun: IGunInstance,
    useLocalNeighbors: boolean,
    isReceiver: boolean
): Cell<A> {
    const get_content = async () => {
        const content = await decode(stateNodes.contentNode, gun);
        if (is_array(content)) {
            return content;
        } else {
            return [];
        }
    };

    var active = true;

    const cell: Cell<A> = {
        getRelation: () => relation,
        getContent: () =>  snapshots.content,
        getStrongest: () => snapshots.strongest,
        getNeighbors: () => useLocalNeighbors ? snapshots.localNeighbors : snapshots.neighbors,
        testContent: () => {
            console.error("gun db can't test content");
            return false;
        },
        update: (increment: CellValue<A> = the_nothing) => {
            stateNodes.contentNode.set(encode(increment));
            return false;
        },
        addNeighbor: (propagator: Propagator, interested_in: NeighborType[]) => {
            const neighbor = construct_neighbor(interested_in, propagator);
            
            if (useLocalNeighbors) {
                snapshots.localNeighbors.set(get_id(propagator), neighbor);
            }
            
            stateNodes.neighborsNode.set(encode(construct_neighbor(interested_in, propagator)) as any);
        },
        removeNeighbor: (propagator: Propagator) => {
            console.error("gun db can't remove neighbor");
        },
        summarize: () => {
            const name = relation.get_name();
            const strongVal = snapshots.strongest;
            const contVal = snapshots.content;

            return [
                `CELL ${name}`,
                `  ID: ${relation.get_id()}`,
                `  STATUS: ${active ? "active" : "disposed"}`,
                `  STRONGEST: \n ${describe(strongVal)}`,
                `  CONTENT: \n ${describe(contVal)}`,
            ].join("\n");
        },
        dispose: () => {
            active = false;
            // Close all Gun.js listeners to prevent memory leaks
            disposeListeners(cell);
        }
    };
    
    return cell;
}

// ============================================================================
// PUBLIC API: INSTANCE (with computation logic)
// ============================================================================

function create_gun_cell<A>(
    gun: IGunInstance,
    name: string,
    id: string = uuidv4(),
): Cell<A> {
    const relation = make_relation(name, get_global_parent(), id);
    
    // Create state nodes using gun_state wrapper
    const stateNodes = create_state_nodes(gun, id, true);
    
    // Initialize snapshots
    const snapshots = create_snapshots<A>();
    
    // Create set_strongest function
    const setStrongest = create_set_strongest(stateNodes, snapshots, true);
    
    // Create cell object first (needed for listener registration)
    const cell = create_cell_object(relation, stateNodes, snapshots, gun, false, false);
    
    // Set up listeners with cell reference for cleanup
    setup_strongest_listener(stateNodes.strongestNode, gun, snapshots, true, id, cell);
    setup_content_listener(stateNodes.contentNode, gun, snapshots, cell);
    setup_neighbors_listener(stateNodes.neighborsNode, gun, snapshots, false, cell);
    initialize_neighbors(stateNodes.neighborsNode, gun, snapshots, false);
    
    // Set up computation logic (instance only)
    setup_computation(stateNodes.contentNode, gun, snapshots, setStrongest, cell);
    
    // Register cell
    set_global_state(PublicStateCommand.ADD_CELL, cell);
    store_gun_cell(id, cell);
    
    return cell;
} 

// ============================================================================
// PUBLIC API: INSTANCE (with test_content logic)
// ============================================================================

export const gun_cell_instance = create_gun_cell

// ============================================================================
// PUBLIC API: RECEIVER (without test_content logic)
// ============================================================================

/**
 * Cell receiver - initiated on other machines
 * Only responsible for putting new values, doesn't run computation
 * Passive receiver: uses direct gun.get(), no computation, filters neighbors to local ones
 */
export function gun_cell_receiver<A>(
    gun: IGunInstance,
    name: string,
    id: string = uuidv4(),
): Cell<A> {
    const relation = make_relation(name, get_global_parent(), id);
    
    // Create state nodes using direct gun.get() (no gun_state wrapper)
    const stateNodes = create_state_nodes(gun, id, false);
    
    // Initialize snapshots
    const snapshots = create_snapshots<A>();
    
    store_gun_cell(id);
    // Create cell object first (needed for listener registration)
    const cell = create_cell_object(relation, stateNodes, snapshots, gun, true, true);
    
    // Set up listeners with cell reference for cleanup
    setup_strongest_listener(stateNodes.strongestNode, gun, snapshots, false, id, cell);
    setup_content_listener(stateNodes.contentNode, gun, snapshots, cell);
    setup_neighbors_listener(stateNodes.neighborsNode, gun, snapshots, false, cell);
    initialize_neighbors(stateNodes.neighborsNode, gun, snapshots, false);
    
    console.log("cell: ", cell_name(cell))
    console.log("id: ", id)
    
    // Register cell
    set_global_state(PublicStateCommand.ADD_CELL, cell);
    
    return cell;
}

// define_generic_procedure_handler(
//     merge_state_with_increment,
//     match_args(is_gun_state, is_map),
//     (state: GunState, increment: Map<any, any>) => {
//         // effectful!
//         increment.forEach(
//             (value, key) => {
//                 if (is_gun_cell_stored(value)) {
//                     // do nothing
//                     // but what if they are gun cell stored
//                     // but not loaded locally?
//                 } 
//                 else {
//                     // create representation of cell inside gun
//                     const representation = create_gun_cell(state.gun, cell_name(value), cell_id(value));
//                     bi_sync(value, representation);
//                 }
//             }
//         )

//         state.set(encode(increment))
        
//     }
// )


// merge propagator 
// if propagator is already exist in gun do nothing
// if it is not then traverse all through 


// this might cause memory leak if we don't clear the gun cells
// TODO!!! this would be critical to fix !!!!
/**
 * Store gun cells to avoid redundant creation
 */
const gun_cells = new Set<string>();

export function store_gun_cell(id: string, cell: Cell<any> | null = null) {
    gun_cells.add(id);
}

export function is_gun_cell_stored(cell: Cell<any>) {
    return gun_cells.has(cell_id(cell));
}

export function get_gun_cell(id: string) {
    return gun_cells.has(id);
}

export function clear_gun_cell_system() {
    gun_cells.clear();
}
