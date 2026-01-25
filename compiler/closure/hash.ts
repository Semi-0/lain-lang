// Type declarations for WeakRef and FinalizationRegistry (available in Node.js 14+)
declare global {
    class WeakRef<T extends object> {
        constructor(target: T);
        deref(): T | undefined;
    }
    
    class FinalizationRegistry<T> {
        constructor(cleanupCallback: (heldValue: T) => void);
        register(target: object, heldValue: T, unregisterToken?: object): void;
        unregister(unregisterToken: object): boolean;
    }
}

export const stableStringify = (obj: any): string => {
    if (Array.isArray(obj)) return `[${obj.map(stableStringify).join(',')}]`;
    if (obj && typeof obj === 'object') {
        return `{${Object.keys(obj).sort().map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
    }
    return JSON.stringify(obj);
};

export const simpleHash = (str: string): string => {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i);
    }
    return (hash >>> 0).toString(16);
};

/**
 * HashStore with weak references to prevent memory leaks.
 * Uses WeakRef to allow objects to be garbage collected while keeping hash lookups.
 */
export class HashStore<T extends object> {
    // Map from hash string to WeakRef of object
    private hashToRef = new Map<string, WeakRef<T>>();
    // Map from object to hash string (using WeakMap so objects can be GC'd)
    private objectToHash = new WeakMap<T, string>();
    // FinalizationRegistry to clean up when objects are GC'd
    private registry: FinalizationRegistry<string>;
    
    /**
     * Get hash for an object if it exists in the store.
     * Internal method for checking existing hashes.
     */
    getHashForObject(obj: T): string | undefined {
        return this.objectToHash.get(obj);
    }

    constructor() {
        this.registry = new FinalizationRegistry((hash: string) => {
            // Clean up hash entry when object is garbage collected
            this.hashToRef.delete(hash);
        });
    }

    get(hash: string): T | undefined {
        const ref = this.hashToRef.get(hash);
        if (!ref) return undefined;
        const obj = ref.deref();
        if (!obj) {
            // Object was GC'd, clean up the entry
            this.hashToRef.delete(hash);
            return undefined;
        }
        return obj;
    }

    set(hash: string, obj: T): void {
        // Only store objects (not primitives)
        if (typeof obj !== 'object' || obj === null) {
            return;
        }
        this.hashToRef.set(hash, new WeakRef(obj));
        this.objectToHash.set(obj, hash);
        // Register for cleanup when object is GC'd
        this.registry.register(obj, hash);
    }

    has(hash: string): boolean {
        const ref = this.hashToRef.get(hash);
        if (!ref) return false;
        const obj = ref.deref();
        if (!obj) {
            // Object was GC'd, clean up
            this.hashToRef.delete(hash);
            return false;
        }
        return true;
    }

    get_or_set(hash: string, creator: () => T): T {
        const existing = this.get(hash);
        if (existing) {
            return existing;
        }
        const obj = creator();
        this.set(hash, obj);
        return obj;
    }

    /**
     * Remove hash entry for a specific object.
     * Call this when disposing objects to immediately clean up.
     */
    delete(obj: T): void {
        const hash = this.objectToHash.get(obj);
        if (hash) {
            this.hashToRef.delete(hash);
            this.objectToHash.delete(obj);
            this.registry.unregister(obj);
        }
    }

    /**
     * Remove hash entry by hash string.
     */
    deleteByHash(hash: string): void {
        const ref = this.hashToRef.get(hash);
        if (ref) {
            const obj = ref.deref();
            if (obj) {
                this.objectToHash.delete(obj);
                this.registry.unregister(obj);
            }
            this.hashToRef.delete(hash);
        }
    }

    clear(): void {
        this.hashToRef.clear();
        // Note: WeakMap and FinalizationRegistry entries will be cleaned up automatically
    }
}

export const globalHashStore = new HashStore<any>();

export const calculate_hash = (data: any): string => {
    const serialized = stableStringify(data);
    const hash = simpleHash(serialized);
    if (!globalHashStore.has(hash)) {
        globalHashStore.set(hash, data);
    }
    return hash;
};

export const calculate_closure_hash = (inputs: any[], outputs: any[], body: any[]): string => 
    calculate_hash({ inputs, outputs, body });

export const get_object_by_hash = (hash: string) => globalHashStore.get(hash);

/**
 * Get hash for an object, calculating and storing if needed.
 * For objects that implement dispose, call remove_hash_from_store when disposing.
 * 
 * Note: This function calculates hash from object content, not from object identity.
 * If the object already exists in the store, returns the existing hash.
 */
export const get_hash = (x: any): string => {
    // For objects, check if we already have a hash stored
    if (typeof x === 'object' && x !== null) {
        const existingHash = globalHashStore.getHashForObject(x);
        if (existingHash) {
            return existingHash;
    }
    }
    
        const hash = calculate_hash(x);
    // Only store objects (not primitives) to avoid memory leaks
    if (typeof x === 'object' && x !== null) {
        globalHashStore.set(hash, x);
    }
        return hash;
    }

/**
 * Remove object from hash store when disposing.
 * Call this in dispose functions to prevent memory leaks.
 */
export const remove_hash_from_store = (obj: any): void => {
    if (typeof obj === 'object' && obj !== null) {
        globalHashStore.delete(obj);
    }
}