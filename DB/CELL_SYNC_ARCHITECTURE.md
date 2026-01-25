# Cell + Gun.js Sync Architecture Design

## The Problem

Gun.js data grows forever (append-only). How do we efficiently sync propagator cells across peers without unbounded growth?

## Your Two Proposals

### Option A: Multiple Gun Databases as Cells

```
┌─────────────────────────────────────────────────────────────┐
│                    Central Gun DB                           │
│  ┌─────────────────────────────────────────────────────┐   │
│  │ cell_registry: {                                    │   │
│  │   "cell_1": { ref: "radata/cell_1", type: "value" } │   │
│  │   "cell_2": { ref: "radata/cell_2", type: "closure"}│   │
│  │   "cell_3": { ref: "radata/cell_3", type: "carried"}│   │
│  │ }                                                    │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                              │
         ┌────────────────────┼────────────────────┐
         ▼                    ▼                    ▼
   ┌──────────┐        ┌──────────┐        ┌──────────┐
   │ Cell 1   │        │ Cell 2   │        │ Cell 3   │
   │ Gun DB   │        │ Gun DB   │        │ Gun DB   │
   │ radata/  │        │ radata/  │        │ radata/  │
   │ cell_1/  │        │ cell_2/  │        │ cell_3/  │
   └──────────┘        └──────────┘        └──────────┘
```

**Pros:**
- Fine-grained garbage collection (delete entire cell DB)
- Selective sync per cell
- Natural isolation

**Cons:**
- Many Gun instances = overhead
- Cross-cell references complex
- Propagator connections span databases

### Option B: Giant Database, Lazy Loading

```
┌─────────────────────────────────────────────────────────────┐
│                    Single Gun DB                            │
│                                                             │
│  cells/                                                     │
│    cell_1: { content: {...}, strongest: "ref:loaded" }     │
│    cell_2: { content: {...}, strongest: null }  ← not loaded│
│    cell_3: { content: {...}, strongest: "ref:loaded" }     │
│                                                             │
│  strongest_cache/ ← loaded on demand                        │
│    cell_1: <actual value>                                   │
│    cell_3: <actual value>                                   │
│                                                             │
│  propagators/                                               │
│    prop_1: { inputs: ["cell_1"], outputs: ["cell_2"] }     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Pros:**
- Simpler architecture
- Easy cross-cell references
- Single sync point

**Cons:**
- Needs compaction strategy
- All-or-nothing sync

---

## Proposed Hybrid Architecture

I think the best approach combines both ideas:

### Core Idea: **Namespace-based Cell Partitioning**

```
┌─────────────────────────────────────────────────────────────┐
│                    Single Gun Instance                      │
│                                                             │
│  Namespace: "active/"                                       │
│  ├── cells/                                                 │
│  │   ├── cell_1: { id, name, strongest_ref }               │
│  │   ├── cell_2: { id, name, strongest_ref }               │
│  │   └── ...                                                │
│  ├── strongest/                                            │
│  │   ├── cell_1: <value>  ← loaded on demand               │
│  │   └── cell_2: <value>                                   │
│  ├── propagators/                                          │
│  │   └── prop_1: { inputs, outputs, type }                 │
│  └── closures/                                             │
│      └── closure_1: { env_ref, body_refs }                 │
│                                                             │
│  Namespace: "archive/" ← old data, can delete              │
│  └── ...                                                    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

### Key Design Decisions

#### 1. Separate Metadata from Values

```typescript
// In Gun.js
cells: {
  cell_123: {
    id: "cell_123",
    name: "my_cell",
    type: "value" | "closure" | "carried",
    version: 42,  // For conflict resolution
    strongest_ref: "strongest/cell_123",  // Lazy load reference
  }
}

strongest: {
  cell_123: <actual_strongest_value>  // Loaded on demand
}
```

#### 2. Lazy Loading Strongest Values

```typescript
interface SyncedCell<A> {
  // Local cell reference
  localCell: Cell<A>;
  
  // Gun reference for metadata
  gunRef: GunRef;
  
  // Load strongest on demand
  loadStrongest(): Promise<CellValue<A>>;
  
  // Update pushes to Gun
  updateStrongest(value: CellValue<A>): void;
}

const createSyncedCell = (gun: Gun, cellId: string): SyncedCell<any> => {
  const localCell = construct_cell(cellId);
  const gunRef = gun.get(`cells/${cellId}`);
  
  return {
    localCell,
    gunRef,
    
    async loadStrongest() {
      return new Promise((resolve) => {
        gun.get(`strongest/${cellId}`).once((data) => {
          if (data) {
            const decoded = gun_db_schema_decode(data);
            localCell.update(decoded);
          }
          resolve(localCell.getStrongest());
        });
      });
    },
    
    updateStrongest(value) {
      const encoded = gun_db_schema_encode(value);
      gun.get(`strongest/${cellId}`).put(encoded);
    }
  };
};
```

#### 3. Selective Sync by Subscription

```typescript
// Only sync cells you care about
class CellSyncManager {
  private gun: Gun;
  private subscribed: Map<string, SyncedCell<any>> = new Map();
  
  subscribe(cellId: string): SyncedCell<any> {
    if (!this.subscribed.has(cellId)) {
      const synced = createSyncedCell(this.gun, cellId);
      
      // Listen for remote updates
      this.gun.get(`strongest/${cellId}`).on((data) => {
        if (data) {
          const decoded = gun_db_schema_decode(data);
          synced.localCell.update(decoded);
        }
      });
      
      this.subscribed.set(cellId, synced);
    }
    return this.subscribed.get(cellId)!;
  }
  
  unsubscribe(cellId: string) {
    const synced = this.subscribed.get(cellId);
    if (synced) {
      this.gun.get(`strongest/${cellId}`).off();
      this.subscribed.delete(cellId);
    }
  }
}
```

#### 4. CarriedCell Sync Strategy

For cells containing other cells:

```typescript
// CarriedCell stores references, not values
carried_cells: {
  carried_123: {
    type: "carried",
    children: ["cell_456", "cell_789"],  // References to child cells
    structure: "map" | "list",
  }
}

// When loading a CarriedCell:
async function loadCarriedCell(gun: Gun, carriedId: string): Promise<Cell<Map<string, Cell<any>>>> {
  const metadata = await gunGet(gun.get(`carried_cells/${carriedId}`));
  
  // Load child cells
  const children = new Map<string, Cell<any>>();
  for (const childId of metadata.children) {
    const childCell = await loadSyncedCell(gun, childId);
    children.set(childId, childCell);
  }
  
  return ce_dict(children);
}
```

#### 5. Closure Sync Strategy

Closures contain env (LexicalEnvironment = Cell<Map>):

```typescript
closures: {
  closure_123: {
    env_cell_id: "cell_env_456",  // Reference to env cell
    name: "my_function",
    inputs: ["x", "y"],
    outputs: ["result"],
    body_refs: ["expr_1", "expr_2"],  // References to body expressions
  }
}
```

#### 6. Compaction Strategy

```typescript
// Periodically compact old data
async function compactCellData(gun: Gun, keepCellIds: string[]) {
  const OLD_DIR = gun._.opt.file;
  const NEW_DIR = OLD_DIR + "_compacted";
  
  // Create new Gun with fresh storage
  const newGun = Gun({ file: NEW_DIR, multicast: false });
  
  // Migrate only active cells
  for (const cellId of keepCellIds) {
    const metadata = await gunGet(gun.get(`cells/${cellId}`));
    const strongest = await gunGet(gun.get(`strongest/${cellId}`));
    
    newGun.get(`cells/${cellId}`).put(metadata);
    newGun.get(`strongest/${cellId}`).put(strongest);
  }
  
  // Switch to new database
  // Delete old directory
}
```

---

## Recommended Approach

### For Your Use Case:

1. **Single Gun database** with namespace partitioning
2. **Lazy load strongest values** - don't load until cell is accessed
3. **Subscribe selectively** - only sync cells that local propagators need
4. **Store references for CarriedCells** - not nested values
5. **Periodic compaction** - migrate active cells, delete old DB

### Data Flow:

```
Local Cell Update
       │
       ▼
┌──────────────────┐
│ cell.update(val) │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐     ┌──────────────────┐
│ test_content()   │────▶│ set_strongest()  │
└────────┬─────────┘     └────────┬─────────┘
         │                        │
         ▼                        ▼
┌──────────────────┐     ┌──────────────────┐
│ alert_propagators│     │ gun.put(encoded) │ ◀── Sync to Gun
└──────────────────┘     └──────────────────┘
                                  │
                                  ▼
                         ┌──────────────────┐
                         │ Gun syncs to     │
                         │ other peers      │
                         └──────────────────┘
```

### Receiving Remote Updates:

```
Gun.on('strongest/cell_X')
         │
         ▼
┌──────────────────┐
│ decode(data)     │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ localCell.update │
└────────┬─────────┘
         │
         ▼
┌──────────────────┐
│ Local propagators│
│ get notified     │
└──────────────────┘
```

---

## Implementation Sketch

```typescript
// cell_sync.ts

import Gun from "gun";
import { Cell, construct_cell, cell_strongest } from "ppropogator/Cell/Cell";
import { gun_db_schema_encode, gun_db_schema_decode } from "./serialize";

export class GunCellSync {
  private gun: Gun;
  private cells: Map<string, Cell<any>> = new Map();
  private subscriptions: Map<string, () => void> = new Map();

  constructor(gun: Gun) {
    this.gun = gun;
  }

  // Create or get a synced cell
  getCell(cellId: string, name?: string): Cell<any> {
    if (!this.cells.has(cellId)) {
      const cell = construct_cell(name || cellId, cellId);
      this.cells.set(cellId, cell);
      
      // Subscribe to remote updates
      this.subscribeToRemote(cellId, cell);
      
      // Watch for local updates
      this.watchLocalUpdates(cellId, cell);
    }
    return this.cells.get(cellId)!;
  }

  private subscribeToRemote(cellId: string, cell: Cell<any>) {
    const handler = (data: any) => {
      if (data && !data._) {
        const decoded = gun_db_schema_decode(data);
        // Update without triggering re-sync
        cell.update(decoded);
      }
    };
    
    this.gun.get(`strongest/${cellId}`).on(handler);
    this.subscriptions.set(cellId, () => {
      this.gun.get(`strongest/${cellId}`).off();
    });
  }

  private watchLocalUpdates(cellId: string, cell: Cell<any>) {
    // Hook into cell's set_strongest
    const originalUpdate = cell.update.bind(cell);
    cell.update = (value: any) => {
      originalUpdate(value);
      // Sync to Gun
      const encoded = gun_db_schema_encode(cell_strongest(cell));
      this.gun.get(`strongest/${cellId}`).put(encoded);
    };
  }

  unsubscribe(cellId: string) {
    const unsub = this.subscriptions.get(cellId);
    if (unsub) unsub();
    this.subscriptions.delete(cellId);
    this.cells.delete(cellId);
  }

  // Get active cell IDs for compaction
  getActiveCellIds(): string[] {
    return Array.from(this.cells.keys());
  }
}
```

---

## Summary

| Aspect | Your Option A | Your Option B | Hybrid (Recommended) |
|--------|--------------|---------------|---------------------|
| Gun instances | Many (per cell) | One | One |
| Isolation | High | Low | Medium (namespaces) |
| Sync granularity | Per cell | All | Selective subscribe |
| Compaction | Delete cell DB | Migrate all | Migrate subscribed |
| Complexity | High | Low | Medium |
| Cross-cell refs | Complex | Simple | Simple |

**My recommendation**: Start with **Option B (giant database)** with **selective subscription** (only sync cells your local propagators need) and **periodic compaction** (migrate active cells to fresh DB monthly).

This gives you:
- Simple architecture
- Bounded disk growth (via compaction)
- Efficient sync (only what you need)
- Easy cross-cell references

---

## Multi-Machine Propagator Sync (Extension Architecture)

**✅ COMPLETED SPEC**: See `DB/db-sync-spec` for complete specification.

### Key Requirements

1. **Different propagator implementations** across machines
2. **Extension layer** (no modifications to Cell/Propagator core)
3. **Full cell content** stored in Gun.js (not just strongest)
4. **Local-only notification** (each machine only notifies its own propagators)

### Architecture

```
┌─────────────────────────────────────────────────────────────┐
│  Existing Cell/Propagator Code (NO MODIFICATIONS)           │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  GunCellSyncExtension (NEW - Extension Layer)                │
│  - Wraps Cell.update()                                       │
│  - Wraps Propagator creation                                 │
│  - Manages local propagator registry                         │
│  - Handles Gun.js sync                                       │
└──────────────────────┬──────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────┐
│  Gun.js Storage                                              │
│  sync/                                                       │
│  ├── cells/{id}/content      ← Full cell content             │
│  ├── cells/{id}/strongest    ← Quick access                 │
│  ├── propagators/{id}/       ← Metadata only                 │
│  ├── machines/{id}/          ← Per-machine tracking         │
│  └── cell_propagator_map/    ← Which props on which machines│
└─────────────────────────────────────────────────────────────┘
```

### Implementation

**Files:**
- `DB/db-sync-spec` - Complete specification
- `DB/gun_cell_sync_extension.ts` - Extension layer implementation
- `DB/gun_cell_sync_example.ts` - Usage examples

**Key Features:**
- ✅ Stores full cell content in Gun.js
- ✅ Tracks propagators per machine
- ✅ Only notifies local propagators
- ✅ Supports different propagator implementations
- ✅ No modifications to existing Cell/Propagator code

**Usage:**
```typescript
const sync = new GunCellSyncExtension(gun, { machineId: "machine_A" });
const cell = sync.createSyncedCell("x", "cell_x");
const prop = construct_propagator([cell], [output], fn, "add");
sync.registerPropagator(prop);
```

See `DB/db-sync-spec` for complete details.
