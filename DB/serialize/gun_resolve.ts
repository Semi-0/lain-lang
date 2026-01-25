// ============================================================================
// GUN OBJECT RESOLUTION
// ============================================================================
// Resolves GUN objects (with references) into normal JavaScript objects
// Based on GUN's data format: https://gun.eco/docs/GUN's-Data-Format-%28JSON%29

import { IGunInstance } from "gun";

/**
 * Type guard to check if a value is a GUN reference
 * GUN references have the format: { '#': 'nodeID' }
 * (Not { '_': { '#': 'nodeID' } } - that's the object metadata format)
 * 
 * Note: A reference is an object with ONLY a '#' key (and possibly GUN internal keys)
 */
const is_gun_reference = (value: any): value is { '#': string } => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }
    
    // Must have '#' key with string value
    if (!('#' in value) || typeof value['#'] !== 'string') {
        return false;
    }
    
    // Check if it's a reference (only has '#' and possibly GUN internal keys like '_')
    // But if it has other data keys, it's an object, not a reference
    const keys = Object.keys(value);
    const dataKeys = keys.filter(k => k !== '#' && k !== '_');
    
    // If there are data keys, it's an object with metadata, not a pure reference
    return dataKeys.length === 0;
};

/**
 * Type guard to check if an object is a GUN graph
 * A GUN graph is a flat object where:
 * - Keys are node IDs (souls)
 * - Values are nodes with _: {'#': soul} metadata matching the key
 * Example: { 'ASDF': { _: {'#': 'ASDF'}, ... }, 'FDSA': { _: {'#': 'FDSA'}, ... } }
 * 
 * IMPORTANT: This should only match when we have MULTIPLE nodes in the graph format.
 * A single node with _ metadata should NOT be treated as a graph.
 */
const is_gun_graph = (value: any): boolean => {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        return false;
    }
    
    const keys = Object.keys(value);
    if (keys.length === 0) {
        return false;
    }
    
    // A graph must have at least 2 nodes (otherwise it's just a single node)
    // This prevents single nodes from being incorrectly identified as graphs
    if (keys.length === 1) {
        return false;
    }
    
    // Check if all keys correspond to node souls in their values
    // A graph has nodes where each key matches the _.# of the node
    for (const key of keys) {
        const node = value[key];
        if (typeof node !== 'object' || node === null) {
            return false;
        }
        
        // Check if node has _ metadata with matching soul
        if (!('_' in node) || typeof node._ !== 'object' || node._ === null) {
            return false;
        }
        
        if (!('#' in node._) || node._['#'] !== key) {
            return false;
        }
    }
    
    return true;
};

/**
 * Reads a value from a GUN node by its ID using .once()
 * Returns a Promise that resolves to the node's data
 * 
 * IMPORTANT: This sets up the listener immediately, so it will catch
 * data that already exists or data that arrives after the listener is set up.
 */
const read_gun_node_once = (gun: IGunInstance, nodeId: string): Promise<any> => {
    return new Promise((resolve, reject) => {
        const node = gun.get(nodeId);
        let resolved = false;
        
        const timeout = setTimeout(() => {
            if (!resolved) {
                resolved = true;
                resolve(null); // Timeout - node doesn't exist or not available
            }
        }, 500); // 500ms timeout - reduced for faster failure detection
        
        // Set up listener IMMEDIATELY - this is critical!
        // If data already exists, .once() will fire immediately
        // If data arrives later, .once() will fire when it arrives
        if (typeof node.once === 'function') {
            node.once((data: any, key?: string) => {
                if (!resolved) {
                    resolved = true;
                    clearTimeout(timeout);
                    
                    if (data === undefined || data === null) {
                        resolve(null);
                    } else if (typeof data === 'object' && Object.keys(data).length === 0) {
                        resolve(null);
                    } else {
                        resolve(data);
                    }
                }
            });
        } else {
            // Fallback to .on() if .once() doesn't exist
            let handler: ((data: any, key?: string) => void) | null = null;
            handler = (data: any, key?: string) => {
                if (!resolved && handler) {
                    resolved = true;
                    clearTimeout(timeout);
                    node.off(handler);
                    
                    if (data === undefined || data === null) {
                        resolve(null);
                    } else if (typeof data === 'object' && Object.keys(data).length === 0) {
                        resolve(null);
                    } else {
                        resolve(data);
                    }
                }
            };
            node.on(handler);
        }
    });
};

/**
 * Reads a value from a GUN node by its ID
 * Returns a Promise that resolves to the node's data
 * Uses the same pattern as gun_cell.ts - .on() with immediate removal
 */
const read_gun_node = (gun: IGunInstance, nodeId: string): Promise<any> => {
    // Try .once() first, which is more appropriate for one-time reads
    return read_gun_node_once(gun, nodeId);
};

/**
 * Resolves a GUN reference to its actual value
 * Recursively resolves nested references
 */
const resolve_gun_reference = async (
    gun: IGunInstance,
    reference: { '#': string },
    visited: Set<string> = new Set()
): Promise<any> => {
    const nodeId = reference['#'];
    
    // Prevent circular references
    if (visited.has(nodeId)) {
        return null; // or could return a special marker for circular refs
    }
    
    visited.add(nodeId);
    
    try {
        const nodeData = await read_gun_node(gun, nodeId);
        
        if (nodeData === null || nodeData === undefined) {
            return null;
        }
        
        // Recursively resolve the node data
        const resolved = await resolve_gun_object(gun, nodeData, visited);
        return resolved;
    } catch (error) {
        console.error(`[resolve_gun_reference] Error resolving GUN reference ${nodeId}:`, error);
        return null;
    }
};

/**
 * Resolves a GUN graph into a normal JavaScript object
 * A graph is a flat object where keys are node IDs and values are nodes
 * Returns the resolved graph as an object with node IDs as keys
 */
const resolve_gun_graph = async (
    gun: IGunInstance,
    graph: Record<string, any>,
    visited: Set<string> = new Set()
): Promise<Record<string, any>> => {
    const resolved: Record<string, any> = {};
    
    // Resolve each node in the graph
    const nodeEntries = await Promise.all(
        Object.entries(graph).map(async ([nodeId, node]) => {
            const resolvedNode = await resolve_gun_object(gun, node, visited);
            return [nodeId, resolvedNode] as [string, any];
        })
    );
    
    for (const [nodeId, resolvedNode] of nodeEntries) {
        resolved[nodeId] = resolvedNode;
    }
    
    return resolved;
};

/**
 * Resolves a GUN object into a normal JavaScript object
 * Handles:
 * - Primitive values (strings, numbers, booleans, null)
 * - GUN references ({'#': 'nodeID'})
 * - GUN objects with metadata ({ _: {'#': 'nodeID'}, ...props })
 * - GUN graphs ({ 'ASDF': { _: {'#': 'ASDF'}, ... }, ... })
 * - Nested objects
 * - Arrays
 * - Sets (objects with keys as identifiers)
 */
export const resolve_gun_object = async (
    gun: IGunInstance,
    obj: any,
    visited: Set<string> = new Set(),
    depth: number = 0,
    maxDepth: number = 100
): Promise<any> => {
    // Prevent infinite recursion
    if (depth > maxDepth) {
        console.error(`[resolve_gun_object] Maximum depth ${maxDepth} exceeded! Possible infinite loop.`);
        throw new Error(`Maximum recursion depth exceeded: ${depth}`);
    }
    
    // Handle null/undefined
    if (obj === null || obj === undefined) {
        return obj;
    }
    
    // Handle primitives (strings, numbers, booleans)
    if (typeof obj !== 'object') {
        return obj;
    }
    
    // Handle GUN references (format: {'#': 'nodeID'})
    if (is_gun_reference(obj)) {
        return await resolve_gun_reference(gun, obj, visited);
    }
    
    // Handle arrays
    if (Array.isArray(obj)) {
        return Promise.all(
            obj.map((item) => {
                return resolve_gun_object(gun, item, visited, depth + 1, maxDepth);
            })
        );
    }
    
    // Handle GUN graphs (flat object with node IDs as keys)
    // Format: { 'ASDF': { _: {'#': 'ASDF'}, ... }, 'FDSA': { _: {'#': 'FDSA'}, ... } }
    if (is_gun_graph(obj)) {
        return await resolve_gun_graph(gun, obj, visited);
    }
    
    // Handle regular objects (including GUN nodes)
    // GUN nodes have format: { _: {'#': 'nodeID'}, ...otherProps }
    // We need to skip the '_' metadata property
    const resolved: Record<string, any> = {};
    const keys = Object.keys(obj);
    
    // Process all keys in parallel for better performance
    const resolvedEntries = await Promise.all(
        keys
            .filter(key => key !== '_') // Skip GUN's internal metadata key
            .map(async (key) => {
                const value = obj[key];
                const resolvedValue = await resolve_gun_object(gun, value, visited, depth + 1, maxDepth);
                return [key, resolvedValue] as [string, any];
            })
    );
    
    // Build the resolved object
    for (const [key, value] of resolvedEntries) {
        resolved[key] = value;
    }
    
    return resolved;
};

/**
 * Convenience function that creates a new visited set for each call
 */
export const gun_resolve = (gun: IGunInstance, obj: any): Promise<any> => {
    return resolve_gun_object(gun, obj, new Set(), 0, 100);
};
