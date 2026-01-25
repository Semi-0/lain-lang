// ============================================================================
// ACCESSING OLD VALUES IN GUN.JS
// ============================================================================
// Since gun.js is append-only, old values persist in storage even after updates.
// This utility provides ways to access those old values.

import { IGunInstance } from "gun";

// ============================================================================
// METHOD 1: Access Raw Storage (Browser)
// ============================================================================

/**
 * Access old values from browser storage (localStorage/IndexedDB)
 * 
 * Note: This only works in browser environments
 */
export const access_raw_storage_browser = {
  /**
   * Get all data from localStorage
   * Gun.js stores data in localStorage with keys like "gun:graph:..."
   */
  getLocalStorageData: (): Record<string, any> => {
    if (typeof window === 'undefined' || !window.localStorage) {
      throw new Error("localStorage not available (not in browser)");
    }
    
    const gunData: Record<string, any> = {};
    
    // Gun.js stores data with keys prefixed by "gun:"
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith('gun:')) {
        try {
          const value = window.localStorage.getItem(key);
          if (value) {
            gunData[key] = JSON.parse(value);
          }
        } catch (e) {
          console.warn(`Failed to parse localStorage key ${key}:`, e);
        }
      }
    }
    
    return gunData;
  },

  /**
   * Get all data from IndexedDB
   * Gun.js may use IndexedDB for larger datasets
   */
  getIndexedDBData: async (): Promise<Record<string, any>> => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      throw new Error("IndexedDB not available (not in browser)");
    }

    return new Promise((resolve, reject) => {
      // Gun.js typically uses a database named "gun"
      const request = window.indexedDB.open('gun', 1);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const db = request.result;
        const data: Record<string, any> = {};
        
        // Iterate through object stores
        const objectStoreNames = Array.from(db.objectStoreNames);
        const promises = objectStoreNames.map(storeName => {
          return new Promise<void>((resolveStore) => {
            const transaction = db.transaction([storeName], 'readonly');
            const store = transaction.objectStore(storeName);
            const getAllRequest = store.getAll();
            
            getAllRequest.onsuccess = () => {
              data[storeName] = getAllRequest.result;
              resolveStore();
            };
            
            getAllRequest.onerror = () => {
              console.warn(`Failed to read from ${storeName}`);
              resolveStore();
            };
          });
        });
        
        Promise.all(promises).then(() => {
          db.close();
          resolve(data);
        });
      };
    });
  },

  /**
   * Search for old values of a specific path in raw storage
   */
  findOldValues: (path: string, storageData: Record<string, any>): any[] => {
    const oldValues: any[] = [];
    const pathParts = path.split('/');
    
    // Search through storage data for matching paths
    const searchInData = (data: any, remainingPath: string[]): void => {
      if (remainingPath.length === 0) {
        // Found a value at this path
        if (data !== null && data !== undefined) {
          oldValues.push(data);
        }
        return;
      }
      
      const [next, ...rest] = remainingPath;
      
      if (data && typeof data === 'object') {
        // Check direct property
        if (data[next] !== undefined) {
          searchInData(data[next], rest);
        }
        
        // Check all keys (gun.js might store with different structures)
        for (const key in data) {
          if (key.includes(next) || next.includes(key)) {
            searchInData(data[key], rest);
          }
        }
      }
    };
    
    // Search through all storage entries
    for (const key in storageData) {
      const value = storageData[key];
      searchInData(value, pathParts);
    }
    
    return oldValues;
  }
};

// ============================================================================
// METHOD 2: Manual Versioning (Store Versions Explicitly)
// ============================================================================

/**
 * Store values with explicit versioning so you can access old versions
 */
export const create_versioned_storage = <T>(
  gun: IGunInstance,
  basePath: string
) => {
  /**
   * Store a new version
   */
  const storeVersion = (value: T, metadata?: { source?: string; timestamp?: number }): void => {
    const timestamp = metadata?.timestamp || Date.now();
    const source = metadata?.source || 'unknown';
    const versionKey = `${timestamp}_${source}`;
    
    // Store in versions set
    gun.get(basePath)
      .get("versions")
      .get(versionKey)
      .put({
        value,
        timestamp,
        source,
        versionKey,
      } as any);
    
    // Also update "latest" pointer
    gun.get(basePath).get("latest").put({
      value,
      timestamp,
      source,
      versionKey,
    } as any);
  };

  /**
   * Get all versions
   */
  const getAllVersions = (): Promise<Array<{ value: T; timestamp: number; source: string; versionKey: string }>> => {
    return new Promise((resolve) => {
      const versions: Array<{ value: T; timestamp: number; source: string; versionKey: string }> = [];
      
      gun.get(basePath)
        .get("versions")
        .map()
        .on((versionData: any, key: string) => {
          if (versionData && versionData.value !== undefined) {
            versions.push(versionData);
          }
        });
      
      // Wait a bit for all versions to arrive
      setTimeout(() => {
        // Sort by timestamp (newest first)
        versions.sort((a, b) => b.timestamp - a.timestamp);
        resolve(versions);
      }, 200);
    });
  };

  /**
   * Get latest version
   */
  const getLatest = (): Promise<T | null> => {
    return new Promise((resolve) => {
      gun.get(basePath).get("latest").once((data: any) => {
        resolve(data?.value || null);
      });
    });
  };

  /**
   * Get version at specific timestamp
   */
  const getVersionAt = (timestamp: number): Promise<T | null> => {
    return new Promise((resolve) => {
      getAllVersions().then(versions => {
        // Find closest version to timestamp
        const closest = versions.reduce((prev, curr) => {
          const prevDiff = Math.abs(prev.timestamp - timestamp);
          const currDiff = Math.abs(curr.timestamp - timestamp);
          return currDiff < prevDiff ? curr : prev;
        });
        
        resolve(closest ? closest.value : null);
      });
    });
  };

  /**
   * Get old versions (before a certain timestamp)
   */
  const getOldVersions = (beforeTimestamp: number): Promise<Array<{ value: T; timestamp: number; source: string }>> => {
    return getAllVersions().then(versions => 
      versions.filter(v => v.timestamp < beforeTimestamp)
    );
  };

  return {
    storeVersion,
    getAllVersions,
    getLatest,
    getVersionAt,
    getOldVersions,
  };
};

// ============================================================================
// METHOD 3: Inspect Gun.js Internal Graph (Advanced)
// ============================================================================

/**
 * Access gun.js internal graph structure
 * Note: This uses internal APIs that may change
 */
export const inspect_gun_graph = (gun: IGunInstance) => {
  /**
   * Get the internal graph object
   * Warning: This accesses internal gun.js structure
   */
  const getGraph = (): any => {
    // @ts-ignore - accessing internal structure
    return gun._.graph || gun._.opt.graph || null;
  };

  /**
   * Find all nodes that contain a specific path
   */
  const findNodesWithPath = (path: string): any[] => {
    const graph = getGraph();
    if (!graph) return [];
    
    const pathParts = path.split('/');
    const results: any[] = [];
    
    const searchGraph = (node: any, remainingPath: string[]): void => {
      if (!node || typeof node !== 'object') return;
      
      if (remainingPath.length === 0) {
        // Found a match
        results.push(node);
        return;
      }
      
      const [next, ...rest] = remainingPath;
      
      // Check if this node has the next path component
      if (node[next] !== undefined) {
        searchGraph(node[next], rest);
      }
      
      // Also search all properties (gun.js might store with metadata)
      for (const key in node) {
        if (key !== '_' && node[key] && typeof node[key] === 'object') {
          searchGraph(node[key], remainingPath);
        }
      }
    };
    
    // Search through graph
    for (const soul in graph) {
      searchGraph(graph[soul], pathParts);
    }
    
    return results;
  };

  /**
   * Get all historical states of a node
   * Gun.js stores states with HAM timestamps
   */
  const getNodeHistory = (soul: string): any[] => {
    const graph = getGraph();
    if (!graph || !graph[soul]) return [];
    
    const node = graph[soul];
    const history: any[] = [];
    
    // Gun.js stores states in the node structure
    // This is highly implementation-dependent
    const collectStates = (obj: any, path: string = ''): void => {
      if (!obj || typeof obj !== 'object') return;
      
      // Check for state information
      if (obj._ && obj._.state) {
        history.push({
          path,
          state: obj._.state,
          data: obj,
        });
      }
      
      // Recursively search
      for (const key in obj) {
        if (key !== '_' && obj[key] && typeof obj[key] === 'object') {
          collectStates(obj[key], path ? `${path}/${key}` : key);
        }
      }
    };
    
    collectStates(node);
    
    // Sort by state (timestamp)
    history.sort((a, b) => (b.state || 0) - (a.state || 0));
    
    return history;
  };

  return {
    getGraph,
    findNodesWithPath,
    getNodeHistory,
  };
};

// ============================================================================
// METHOD 4: Query All Values from a Set (For Versioned Storage)
// ============================================================================

/**
 * Get all values from a gun.js set (useful when storing versions in sets)
 */
export const get_all_from_set = <T>(
  gun: IGunInstance,
  setPath: string
): Promise<T[]> => {
  return new Promise((resolve) => {
    const values: T[] = [];
    
    gun.get(setPath)
      .map()
      .on((data: T, key: string) => {
        if (data !== null && data !== undefined) {
          values.push(data);
        }
      });
    
    // Wait for all values to arrive
    setTimeout(() => {
      resolve(values);
    }, 200);
  });
};

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/**
 * Example: Access old values using versioned storage
 */
export const example_versioned_storage = (gun: IGunInstance) => {
  const cellStorage = create_versioned_storage(gun, "cells/cell_123");
  
  // Store versions
  cellStorage.storeVersion({ value: 10 }, { source: "machine_A", timestamp: Date.now() });
  cellStorage.storeVersion({ value: 20 }, { source: "machine_B", timestamp: Date.now() + 1000 });
  
  // Get all versions
  cellStorage.getAllVersions().then(versions => {
    console.log("All versions:", versions);
  });
  
  // Get old versions
  const oneHourAgo = Date.now() - 3600000;
  cellStorage.getOldVersions(oneHourAgo).then(oldVersions => {
    console.log("Old versions:", oldVersions);
  });
};

/**
 * Example: Access raw browser storage
 */
export const example_raw_storage = async () => {
  if (typeof window === 'undefined') {
    console.log("Not in browser environment");
    return;
  }
  
  try {
    // Get localStorage data
    const localStorageData = access_raw_storage_browser.getLocalStorageData();
    console.log("localStorage data:", localStorageData);
    
    // Find old values for a specific path
    const oldValues = access_raw_storage_browser.findOldValues("cells/cell_123", localStorageData);
    console.log("Old values found:", oldValues);
    
    // Get IndexedDB data
    const indexedDBData = await access_raw_storage_browser.getIndexedDBData();
    console.log("IndexedDB data:", indexedDBData);
  } catch (e) {
    console.error("Error accessing raw storage:", e);
  }
};
