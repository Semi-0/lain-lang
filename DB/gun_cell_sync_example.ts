/**
 * Example: Using GunCellSyncExtension with existing Cell/Propagator code
 * 
 * This demonstrates how the extension layer works WITHOUT modifying
 * the existing Cell.ts or Propagator.ts code.
 */

import Gun from "gun";
import http from "http";
import { GunCellSyncExtension } from "./gun_cell_sync_extension";
import { construct_propagator } from "ppropogator/Propagator/Propagator";
import { p_add } from "ppropogator/Propagator/BuiltInProps";

// ============================================================================
// EXAMPLE 1: Basic Cell Sync
// ============================================================================

export async function example1_BasicCellSync() {
  const server = http.createServer().listen(0);
  const gun = Gun({ web: server });
  
  // Create sync extension
  const sync = new GunCellSyncExtension(gun, {
    machineId: "machine_A",
  });
  
  // Create a synced cell (uses existing construct_cell internally)
  const cellX = sync.createSyncedCell("x", "cell_x");
  
  // Update cell (existing API)
  cellX.update(42);
  
  // Extension automatically:
  // 1. Syncs to Gun.js
  // 2. Other machines receive update
  // 3. Only local propagators get notified
}

// ============================================================================
// EXAMPLE 2: Propagator Registration
// ============================================================================

export async function example2_PropagatorRegistration() {
  const server = http.createServer().listen(0);
  const gun = Gun({ web: server });
  const sync = new GunCellSyncExtension(gun, { machineId: "machine_A" });
  
  // Create cells (existing API)
  const cellA = sync.createSyncedCell("a", "cell_a");
  const cellB = sync.createSyncedCell("b", "cell_b");
  const cellSum = sync.createSyncedCell("sum", "cell_sum");
  
  // Create propagator (existing API)
  const addProp = construct_propagator(
    [cellA, cellB],
    [cellSum],
    () => {
      // This implementation is LOCAL to this machine
      // Other machines may have different implementations
      const a = cellA.getStrongest();
      const b = cellB.getStrongest();
      cellSum.update(a + b);
    },
    "add"
  );
  
  // Register propagator (extension API)
  sync.registerPropagator(addProp);
  
  // Now:
  // 1. Propagator metadata synced to Gun
  // 2. Cell-propagator mapping updated
  // 3. When cellA or cellB update, only THIS machine's propagator runs
}

// ============================================================================
// EXAMPLE 3: Different Propagator Implementations
// ============================================================================

export async function example3_DifferentImplementations() {
  // Machine A: Standard addition
  const serverA = http.createServer().listen(9001);
  const gunA = Gun({ web: serverA });
  const syncA = new GunCellSyncExtension(gunA, { machineId: "machine_A" });
  
  const cellX_A = syncA.createSyncedCell("x", "cell_x");
  const cellY_A = syncA.createSyncedCell("y", "cell_y");
  const cellZ_A = syncA.createSyncedCell("z", "cell_z");
  
  const addPropA = construct_propagator(
    [cellX_A, cellY_A],
    [cellZ_A],
    () => {
      // Machine A: z = x + y
      const x = cellX_A.getStrongest();
      const y = cellY_A.getStrongest();
      cellZ_A.update(x + y);
    },
    "add"
  );
  syncA.registerPropagator(addPropA);
  
  // Machine B: Different implementation
  const serverB = http.createServer().listen(9002);
  const gunB = Gun({ web: serverB, peers: ["http://localhost:9001/gun"] });
  const syncB = new GunCellSyncExtension(gunB, { machineId: "machine_B" });
  
  const cellX_B = syncB.createSyncedCell("x", "cell_x");
  const cellY_B = syncB.createSyncedCell("y", "cell_y");
  const cellW_B = syncB.createSyncedCell("w", "cell_w");  // Different output!
  
  const addPropB = construct_propagator(
    [cellX_B, cellY_B],
    [cellW_B],
    () => {
      // Machine B: w = x + y + 1 (different implementation!)
      const x = cellX_B.getStrongest();
      const y = cellY_B.getStrongest();
      cellW_B.update(x + y + 1);
    },
    "add"  // Same name, different implementation
  );
  syncB.registerPropagator(addPropB);
  
  // When cell_x updates:
  // - Both machines receive the same value
  // - Machine A computes: cell_z = x + y
  // - Machine B computes: cell_w = x + y + 1
  // - Each machine only runs its own propagator
}

// ============================================================================
// EXAMPLE 4: Selective Notification
// ============================================================================

export async function example4_SelectiveNotification() {
  const server = http.createServer().listen(0);
  const gun = Gun({ web: server });
  const sync = new GunCellSyncExtension(gun, { machineId: "machine_A" });
  
  // Create a cell
  const cellData = sync.createSyncedCell("data", "cell_data");
  
  // Create propagator 1
  const prop1 = construct_propagator(
    [cellData],
    [sync.createSyncedCell("output1", "cell_out1")],
    () => { console.log("Propagator 1 activated"); },
    "prop1"
  );
  sync.registerPropagator(prop1);
  
  // Create propagator 2
  const prop2 = construct_propagator(
    [cellData],
    [sync.createSyncedCell("output2", "cell_out2")],
    () => { console.log("Propagator 2 activated"); },
    "prop2"
  );
  sync.registerPropagator(prop2);
  
  // Update cell
  cellData.update(100);
  
  // Result:
  // - Both prop1 and prop2 are notified (they're local)
  // - Remote machines don't get notified (they handle their own)
  // - Only local propagators run
}

// ============================================================================
// EXAMPLE 5: Remote Update Handling
// ============================================================================

export async function example5_RemoteUpdate() {
  // Machine A updates a cell
  const serverA = http.createServer().listen(9001);
  const gunA = Gun({ web: serverA });
  const syncA = new GunCellSyncExtension(gunA, { machineId: "machine_A" });
  
  const cellX_A = syncA.createSyncedCell("x", "cell_x");
  cellX_A.update(42);  // Syncs to Gun
  
  // Machine B receives update
  const serverB = http.createServer().listen(9002);
  const gunB = Gun({ web: serverB, peers: ["http://localhost:9001/gun"] });
  const syncB = new GunCellSyncExtension(gunB, { machineId: "machine_B" });
  
  // Load cell (will receive remote update)
  const cellX_B = await syncB.loadCell("cell_x");
  
  // Create local propagator
  const propB = construct_propagator(
    [cellX_B],
    [syncB.createSyncedCell("y", "cell_y")],
    () => {
      // This runs when cell_x updates (local or remote)
      const x = cellX_B.getStrongest();
      console.log(`Machine B: cell_x = ${x}`);
    },
    "machine_B_prop"
  );
  syncB.registerPropagator(propB);
  
  // When Machine A updates cell_x:
  // 1. Update syncs to Gun
  // 2. Machine B receives update
  // 3. cellX_B updates locally
  // 4. Only Machine B's propagator runs (not Machine A's)
}

// ============================================================================
// USAGE PATTERN
// ============================================================================

/**
 * Typical usage pattern:
 * 
 * 1. Initialize sync extension
 *    const sync = new GunCellSyncExtension(gun, { machineId });
 * 
 * 2. Create cells (existing API, wrapped by extension)
 *    const cell = sync.createSyncedCell(name, id);
 * 
 * 3. Create propagators (existing API)
 *    const prop = construct_propagator(inputs, outputs, fn, name);
 * 
 * 4. Register propagators (extension API)
 *    sync.registerPropagator(prop);
 * 
 * 5. Use cells normally (existing API)
 *    cell.update(value);
 * 
 * The extension handles:
 * - Syncing cell content to Gun
 * - Receiving remote updates
 * - Notifying only local propagators
 * - Tracking propagators per machine
 */















