import { construct_simple_generic_procedure, define_generic_procedure_handler } from "generic-handler/GenericProcedure";
import type { IGunInstance } from "gun"
import { encode } from "./resolve";
import { define_generic_expr_handler } from "../../compiler/compiler_helper";
import { match_args } from "ppropogator";
import { is_map } from "ppropogator/Helper/Helper";
import { is_cell } from "ppropogator/Cell/Cell";
export interface GunState {
    gun: IGunInstance;
    parent: GunState | null;
    name: string;
    update: (data: any) => void;
    on: (callback: (data: any, key?: string) => void) => void;
  
    set: (data: any) => void;
    getNode: () => any; // Returns the underlying Gun node for advanced operations
}

/**
 * Creates a root state object that serves as the parent for all other states.
 * The root state has name "root" and no parent.
 */
export const create_root_state = (gun: IGunInstance): GunState => {
    return {
        gun: gun,
        parent: null,
        name: "root",
        update: (data: any) => {
            // Root state doesn't have a node to update
            console.warn("Cannot update root state directly");
        },
        on: (callback: (data: any, key?: string) => void) => {
            // Root state doesn't have a node to listen to
            console.warn("Cannot listen to root state directly");
        },

        set: (data: any) => {
            // Root state doesn't have a node to set
            console.warn("Cannot set root state directly");
        },
        getNode: () => {
            return gun;
        }
    };
};

/**
 * Creates a nested state node in the Gun.js database.
 * If parent is root, creates a top-level node.
 * Otherwise, creates a nested node under the parent.
 * 
 * @param parent - The parent state (must be root or another GunState)
 * @param gun - The Gun instance
 * @param name - The name/key for this state node
 * @param initialData - Initial data to put into the node (optional)
 */
export const gun_state = (
    parent: GunState, 
    gun: IGunInstance, 
    name: string, 
    initialData?: any
): GunState => {
    let node: any;
    
    if (parent.name === "root") {
        // Top-level node
        node = gun.get(name);
        if (initialData !== undefined) {
            node.put(initialData);
        }
    } else {
        // Nested node under parent - use parent's node to build the path correctly
        // This handles arbitrary depth nesting
        const parentNode = parent.getNode();
        
        // CRITICAL FIX: Put to parent BEFORE getting child (like: gun.get().put().get())
        // This pattern is required for nested listeners to work at depth 2+
        // Gun.js rejects empty objects ({}), so we use a marker property
        if (parentNode && parent.name !== "root") {
            // PUT to parent FIRST - this ensures parent exists with data
            // This is the pattern that works: put before get
            parentNode.put({ _gun_state_initialized: true });
            
            // Recursively ensure all ancestors exist by putting to them
            // This ensures the entire path from root to parent is initialized
            let currentParent = parent.parent;
            while (currentParent && currentParent.name !== "root") {
                const ancestorNode = currentParent.getNode();
                if (ancestorNode) {
                    ancestorNode.put({ _gun_state_initialized: true });
                }
                currentParent = currentParent.parent;
            }
        }
        
        // NOW get the child node (after parent has been put to)
        node = parentNode.get(name);
        
        // Don't initialize child with put({}) - Gun.js rejects empty objects
        // The child node will be created when we put actual data to it
        
        if (initialData !== undefined) {
            node.put(initialData);
        }
    }

    return {
        gun: gun,
        parent: parent,
        name: name,
        update: (data: any) => {
            node.put(data);
        },
        on: (callback: (data: any, key?: string) => void) => {
            // Set up listener - this will fire for both initial value (if exists) and future changes
            node.on(callback);
        },

        set: (data: any) => {
            node.set(data);
        },
        getNode: () => {
            return node;
        }
    };
};

export const is_gun_state = (value: any): value is GunState => {
    return typeof value === "object" && value !== null && "gun" in value && "parent" in value && "name" in value && "update" in value && "on" in value && "put" in value && "set" in value && "getNode" in value;
}

export const update_gun_state = construct_simple_generic_procedure(
    "update_gun_state",
    2,
    (state: GunState, increment: any) => {
        return state.getNode().put(encode(increment));
    }
)

export const merge_state_with_increment = construct_simple_generic_procedure(
    "merge_state_with_increment",
    2,
    (state: GunState, increment: any) => {
        return state.getNode().set(increment);
    }
)


