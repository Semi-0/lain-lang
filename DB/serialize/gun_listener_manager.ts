/**
 * Gun listener management to prevent memory leaks
 * Tracks and closes all Gun.js listeners when cells/propagators are disposed
 */

import type { IGunInstance } from "gun";

export type GunListener = (...args: any[]) => void | Promise<void>;
export type GunNode = any; // Gun.js node type

export interface ListenerHandle {
    node: GunNode;
    listener: GunListener;
    key?: string; // For map().on() listeners, the key being listened to
}

/**
 * Manages Gun.js listeners for a cell or propagator.
 * Automatically closes all listeners when disposed.
 */
export class GunListenerManager {
    private listeners: ListenerHandle[] = [];
    private keyListeners: Map<string, ListenerHandle> = new Map(); // For map().on() key-specific listeners
    private disposed = false;

    /**
     * Register a listener that will be closed on dispose.
     * @param node - Gun node to listen on
     * @param listener - Listener function
     * @param key - Optional key for map().on() listeners
     */
    register(node: GunNode, listener: GunListener, key?: string): void {
        if (this.disposed) {
            throw new Error("Cannot register listener on disposed manager");
        }

        const handle: ListenerHandle = { node, listener, key };
        this.listeners.push(handle);
        
        if (key) {
            this.keyListeners.set(key, handle);
        }

        // Register the listener with Gun
        if (key) {
            // For map().on(), we need to get the specific key node
            const keyNode = node.get(key);
            keyNode.on(listener);
        } else {
            node.on(listener);
        }
    }

    /**
     * Register a map().on() listener that will be closed on dispose.
     * This prevents memory leaks from map listeners.
     * 
     * Note: map().on() creates a single listener that fires for all keys.
     * We store the map chain to close it properly.
     */
    registerMapListener(
        mapNode: GunNode,
        listener: (data: any, key: string) => void | Promise<void>
    ): void {
        if (this.disposed) {
            throw new Error("Cannot register listener on disposed manager");
        }

        // Wrap the listener to check if disposed
        const wrappedListener = async (data: any, key: string) => {
            if (this.disposed) return;
            await listener(data, key);
        };

        // Store the map chain so we can close it
        const mapChain = mapNode.map();
        const handle: ListenerHandle = { 
            node: mapChain, // Store the map chain, not the original node
            listener: wrappedListener 
        };
        this.listeners.push(handle);
        
        // Register with Gun's map().on() - this returns the chain
        mapChain.on(wrappedListener);
    }

    /**
     * Close a specific key listener (for map().on() scenarios).
     */
    closeKeyListener(key: string): void {
        const handle = this.keyListeners.get(key);
        if (handle) {
            const keyNode = handle.node.get(key);
            if (keyNode && keyNode.off) {
                keyNode.off(handle.listener);
            }
            this.keyListeners.delete(key);
        }
    }

    /**
     * Dispose all listeners and prevent new registrations.
     */
    dispose(): void {
        if (this.disposed) return;
        
        this.disposed = true;

        // Close all listeners
        for (const handle of this.listeners) {
            try {
                if (handle.key) {
                    // Close key-specific listener
                    const keyNode = handle.node.get(handle.key);
                    if (keyNode && typeof keyNode.off === 'function') {
                        keyNode.off(handle.listener);
                    }
                } else {
                    // Close general listener (works for both regular .on() and map().on())
                    if (handle.node && typeof handle.node.off === 'function') {
                        handle.node.off(handle.listener);
                    }
                }
            } catch (error) {
                // Ignore errors during cleanup
                console.warn("Error closing Gun listener:", error);
            }
        }

        // Close all key listeners
        for (const [key, handle] of this.keyListeners.entries()) {
            try {
                const keyNode = handle.node.get(key);
                if (keyNode && keyNode.off) {
                    keyNode.off(handle.listener);
                }
            } catch (error) {
                console.warn(`Error closing key listener for ${key}:`, error);
            }
        }

        this.listeners = [];
        this.keyListeners.clear();
    }

    /**
     * Check if manager is disposed.
     */
    isDisposed(): boolean {
        return this.disposed;
    }
}

/**
 * Global registry to track listener managers per cell/propagator.
 * This allows cleanup when cells are disposed.
 */
const listenerManagers = new WeakMap<any, GunListenerManager>();

/**
 * Get or create a listener manager for an object (cell/propagator).
 */
export const getListenerManager = (obj: any): GunListenerManager => {
    let manager = listenerManagers.get(obj);
    if (!manager) {
        manager = new GunListenerManager();
        listenerManagers.set(obj, manager);
    }
    return manager;
};

/**
 * Dispose listeners for an object.
 */
export const disposeListeners = (obj: any): void => {
    const manager = listenerManagers.get(obj);
    if (manager) {
        manager.dispose();
        listenerManagers.delete(obj);
    }
};
