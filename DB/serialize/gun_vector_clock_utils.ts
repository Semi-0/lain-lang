// // ============================================================================
// // GUN.JS VECTOR CLOCK UTILITIES
// // ============================================================================
// // Utilities to ensure we get the latest value based on vector clock comparison
// // when reading from gun.js

// import { IGunInstance } from "gun";
// import { VectorClock, generic_version_vector_clock_compare, result_is_less_than, result_is_greater_than } from "ppropogator/AdvanceReactivity/vector_clock";
// import { vector_clock_layer } from "ppropogator/AdvanceReactivity/vector_clock";
// import { is_layered_object } from "sando-layer/Basic/LayeredObject";

// // ============================================================================
// // TYPES
// // ============================================================================

// /**
//  * A versioned value stored in gun.js
//  * Each value is stored with its vector clock for comparison
//  */
// export type VersionedValue<T> = {
//   value: T;
//   vectorClock: VectorClock;
//   timestamp?: number; // Optional: can be used as a fallback or for gun.js HAM
// };

// // ============================================================================
// // VECTOR CLOCK COMPARISON
// // ============================================================================

// /**
//  * Compare two versioned values and return the latest one
//  * Returns:
//  * - 1 if a is fresher (newer)
//  * - -1 if b is fresher (newer)
//  * - 0 if they are concurrent or equal
//  */
// export const compare_versioned_values = <T>(
//   a: VersionedValue<T>,
//   b: VersionedValue<T>
// ): number => {
//   const comparison = generic_version_vector_clock_compare(
//     a.vectorClock,
//     b.vectorClock
//   );
  
//   if (result_is_greater_than(comparison)) {
//     return 1; // a is fresher
//   } else if (result_is_less_than(comparison)) {
//     return -1; // b is fresher
//   } else {
//     // Concurrent or equal - could use timestamp as tiebreaker
//     if (a.timestamp && b.timestamp) {
//       return a.timestamp > b.timestamp ? 1 : a.timestamp < b.timestamp ? -1 : 0;
//     }
//     return 0;
//   }
// };

// /**
//  * Get the latest value from an array of versioned values
//  * Uses vector clock comparison to determine which is freshest
//  */
// export const get_latest_versioned_value = <T>(
//   values: VersionedValue<T>[]
// ): VersionedValue<T> | null => {
//   if (values.length === 0) return null;
//   if (values.length === 1) return values[0];
  
//   return values.reduce((latest, current) => {
//     const comparison = compare_versioned_values(latest, current);
//     return comparison >= 0 ? latest : current;
//   });
// };

// // ============================================================================
// // LAYERED OBJECT HELPERS
// // ============================================================================

// /**
//  * Extract vector clock from a layered object
//  */
// export const extract_vector_clock = (obj: any): VectorClock | null => {
//   if (is_layered_object(obj) && vector_clock_layer.has_value(obj)) {
//     return vector_clock_layer.get_value(obj);
//   }
//   return null;
// };

// /**
//  * Create a versioned value from a layered object
//  */
// export const create_versioned_from_layered = <T>(
//   value: T,
//   timestamp?: number
// ): VersionedValue<T> | null => {
//   const clock = extract_vector_clock(value);
//   if (!clock) return null;
  
//   return {
//     value,
//     vectorClock: clock,
//     timestamp,
//   };
// };

// // ============================================================================
// // GUN.JS READ HELPERS
// // ============================================================================

// /**
//  * Read a value from gun.js and ensure we get the latest based on vector clock
//  * 
//  * Strategy: Store multiple versions in a set, then compare vector clocks
//  * 
//  * @param gun - Gun instance
//  * @param path - Path to the data in gun.js
//  * @param extractVectorClock - Function to extract vector clock from the value
//  * @returns Promise resolving to the latest value based on vector clock
//  */
// export const get_latest_from_gun = <T>(
//   gun: IGunInstance,
//   path: string,
//   extractVectorClock: (value: T) => VectorClock | null
// ): Promise<T | null> => {
//   return new Promise((resolve) => {
//     const versions: VersionedValue<T>[] = [];
//     let timeout: NodeJS.Timeout | null = null;
    
//     // Collect all versions from the set
//     const versionsSet = gun.get(path).get("versions");
    
//     versionsSet.map().on((versionData: any, key: string) => {
//       if (!versionData) return;
      
//       try {
//         const vectorClock = extractVectorClock(versionData);
//         if (vectorClock) {
//           versions.push({
//             value: versionData,
//             vectorClock,
//             timestamp: versionData.timestamp,
//           });
//         }
//       } catch (e) {
//         console.error(`Error extracting vector clock from version ${key}:`, e);
//       }
//     });
    
//     // Wait a bit for all versions to arrive, then resolve with latest
//     if (timeout) clearTimeout(timeout);
//     timeout = setTimeout(() => {
//       const latest = get_latest_versioned_value(versions);
//       resolve(latest ? latest.value : null);
//     }, 100); // Small delay to collect versions
//   });
// };

// /**
//  * Store a versioned value in gun.js
//  * Stores it in a set of versions so we can compare later
//  * 
//  * @param gun - Gun instance
//  * @param path - Path to store the data
//  * @param value - The value to store (should have vector clock)
//  * @param extractVectorClock - Function to extract vector clock
//  */
// export const store_versioned_in_gun = <T>(
//   gun: IGunInstance,
//   path: string,
//   value: T,
//   extractVectorClock: (value: T) => VectorClock | null
// ): void => {
//   const vectorClock = extractVectorClock(value);
//   if (!vectorClock) {
//     console.warn("Value does not have vector clock, storing without versioning");
//     gun.get(path).put(value as any);
//     return;
//   }
  
//   // Create a unique key for this version (could use hash of vector clock)
//   const versionKey = Array.from(vectorClock.entries())
//     .sort(([a], [b]) => a.localeCompare(b))
//     .map(([source, count]) => `${source}:${count}`)
//     .join("|");
  
//   // Store in versions set
//   const versionedValue = {
//     ...value,
//     timestamp: Date.now(),
//   };
  
//   gun.get(path).get("versions").get(versionKey).put(versionedValue as any);
  
//   // Also store as "latest" for quick access (will be updated by get_latest_from_gun)
//   // But we still keep versions for conflict resolution
// };

// // ============================================================================
// // ALTERNATIVE: Use gun.js HAM with vector clock as state
// // ============================================================================

// /**
//  * Convert vector clock to a comparable state value for gun.js HAM
//  * This allows gun.js's HAM to use vector clock for conflict resolution
//  * 
//  * Strategy: Serialize vector clock to a string that can be compared
//  */
// export const vector_clock_to_ham_state = (clock: VectorClock): string => {
//   // Sort by source ID for deterministic ordering
//   const entries = Array.from(clock.entries()).sort(([a], [b]) => 
//     a.localeCompare(b)
//   );
  
//   // Create a string representation that preserves ordering
//   // Format: "source1:count1|source2:count2|..."
//   return entries.map(([source, count]) => `${source}:${count}`).join("|");
// };

// /**
//  * Store value with vector clock as HAM state
//  * This leverages gun.js's built-in conflict resolution
//  */
// export const store_with_ham_state = <T>(
//   gun: IGunInstance,
//   path: string,
//   value: T,
//   extractVectorClock: (value: T) => VectorClock | null
// ): void => {
//   const vectorClock = extractVectorClock(value);
//   if (!vectorClock) {
//     gun.get(path).put(value as any);
//     return;
//   }
  
//   // Create a wrapper that includes the vector clock as metadata
//   const wrapped = {
//     data: value,
//     _vectorClock: Object.fromEntries(vectorClock), // Convert Map to object for JSON
//     _hamState: vector_clock_to_ham_state(vectorClock),
//   };
  
//   // Note: gun.js will use the _hamState for conflict resolution if we configure it
//   // But by default, gun.js uses timestamps. We'd need to customize HAM.
//   gun.get(path).put(wrapped as any);
// };

// /**
//  * Read value and extract data, handling vector clock metadata
//  */
// export const read_with_ham_state = <T>(
//   gun: IGunInstance,
//   path: string
// ): Promise<T | null> => {
//   return new Promise((resolve) => {
//     gun.get(path).once((data: any) => {
//       if (!data) {
//         resolve(null);
//         return;
//       }
      
//       // If it's wrapped with vector clock metadata, extract it
//       if (data.data && data._vectorClock) {
//         resolve(data.data);
//       } else {
//         resolve(data);
//       }
//     });
//   });
// };

// // ============================================================================
// // RECOMMENDED APPROACH: Store versions in set, compare on read
// // ============================================================================

// /**
//  * Recommended approach: Store each update as a version in a set
//  * When reading, collect all versions and pick the latest using vector clock
//  * 
//  * Usage:
//  * ```typescript
//  * // Store
//  * store_versioned_value(gun, "cells/cell_123", cellValue, extractVectorClock);
//  * 
//  * // Read latest
//  * const latest = await get_latest_versioned_value_from_gun(
//  *   gun, 
//  *   "cells/cell_123", 
//  *   extractVectorClock
//  * );
//  * ```
//  */
// export const store_versioned_value = <T>(
//   gun: IGunInstance,
//   path: string,
//   value: T,
//   extractVectorClock: (value: T) => VectorClock | null
// ): void => {
//   store_versioned_in_gun(gun, path, value, extractVectorClock);
// };

// export const get_latest_versioned_value_from_gun = <T>(
//   gun: IGunInstance,
//   path: string,
//   extractVectorClock: (value: T) => VectorClock | null
// ): Promise<T | null> => {
//   return get_latest_from_gun(gun, path, extractVectorClock);
// };
