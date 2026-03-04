import {
    Cell,
    construct_propagator,
    Propagator,
    propagator_id,
    propagator_name,
  } from "ppropogator";
  
  import {
    cell_dependents,
    cell_id,
    cell_neighbor_set,
    cell_name,
    NeighborType,
  } from "ppropogator/Cell/Cell";
  
  import { dispose_propagator, propagator_inputs } from "ppropogator/Propagator/Propagator";
  import { p_tap } from "ppropogator/Propagator/BuiltInProps";
  import { update_source_cell } from "ppropogator/DataTypes/PremisesSource";
  import { DirectedGraph } from "graphology";
  import { create_cell_label, create_propagator_label, make_name } from "../naming";

  export type GraphNode = { id: string; label: string };
  export type GraphLink = { source: string; target: string };
  export type Graph = { nodes: GraphNode[]; links: GraphLink[] };

  const create_tracer_name = (name: string) => make_name([name, "tracer"]);

  const is_tracer_propagator = (p: Propagator) => propagator_name(p).includes("tracer");

  /** Stable graph signature so we only publish when graph actually changed. */
  const graph_signature = (g: DirectedGraph): string => {
    const nodes = g
      .nodes()
      .map((id) => {
        const label = g.getNodeAttribute(id, "label");
        return `${id}:${String(label ?? "")}`;
      })
      .sort();
    const edges = g
      .edges()
      .map((edgeKey) => `${g.source(edgeKey)}->${g.target(edgeKey)}`)
      .sort();
    return `${nodes.join(";")}||${edges.join(";")}`;
  };

  /** Cap on total nodes (cells + propagators) to avoid unbounded BFS (e.g. ce_map_expr over large arrays). */
  const TRACER_MAX_NODES = 2000;

  export type TraceUpstreamOptions = {
    /** Max nodes (cells + propagators) before stopping BFS. Default 2000. */
    maxNodes?: number;
    /** Max rebuilds before stopping (circuit breaker for infinite-loop debugging). */
    maxRebuilds?: number;
    /** Called after each rebuild (e.g. for tests to count iterations). */
    onRebuild?: () => void;
  };

  export type TraceUpstreamPeriodicOptions = {
    /** Max nodes (cells + propagators) before stopping BFS. Default 2000. */
    maxNodes?: number;
    /** Interval in ms between pulls. Default 100. */
    intervalMs?: number;
  };

  export const trace_upstream_reactively = (
    root: Cell<any>,
    gatherer: Cell<any>,
    options: TraceUpstreamOptions = {}
  ) => {
    const maxNodes = options.maxNodes ?? TRACER_MAX_NODES;
    const maxRebuilds = options.maxRebuilds;
    const onRebuild = options.onRebuild;
    const tappedCells = new Set<string>();
    const tapPropagators = new Map<string, Propagator>();
    const g = new DirectedGraph();
    let initialized = false;
    let pending = false;
    let rebuildCount = 0;
    let lastGraphSig: string | null = null;
    let self: Propagator | null = null;

    const isSelfActive = () => self != null && cell_neighbor_set(root).has(self);
    const disposeAllTaps = () => {
      for (const tap of tapPropagators.values()) {
        dispose_propagator(tap);
      }
      tapPropagators.clear();
      tappedCells.clear();
    };

    const rebuildGraphOnce = () => {
      if (!isSelfActive()) {
        disposeAllTaps();
        return;
      }
      g.clear();

      // BFS upstream: from root, go to its dependents (propagators),
      // then to each propagator's input cells, etc.
      // seenCells/seenProps prevent infinite loops on cyclic graphs (bi_sync, p_feedback, etc).
      const seenCells = new Set<string>();
      const seenProps = new Set<string>();
      const q: Cell<any>[] = [root];
      let nodeCount = 0;
      let truncated = false;

      while (q.length > 0 && !truncated) {
        const c = q.shift()!;
        const cid = cell_id(c);
        if (seenCells.has(cid)) continue;
        if (nodeCount >= maxNodes) {
          truncated = true;
          break;
        }
        seenCells.add(cid);
        nodeCount++;

        if (cell_id(c) !== cell_id(gatherer)) {
          const id = cell_id(c);
          if (!tappedCells.has(id)) {
            tappedCells.add(id);
            const tap = p_tap(c, () => {
              if (!isSelfActive()) {
                disposeAllTaps();
                return;
              }
              if (maxRebuilds != null && rebuildCount >= maxRebuilds) return;
              scheduleRebuild();
            });
            tapPropagators.set(id, tap);
          }
        }

        g.mergeNode(cid, { label: create_cell_label(c) });

        for (const p of cell_dependents(c)) {
          if (is_tracer_propagator(p)) continue;

          const pid = propagator_id(p);
          if (!seenProps.has(pid)) {
            if (nodeCount >= maxNodes) {
              truncated = true;
              break;
            }
            seenProps.add(pid);
            nodeCount++;
            g.mergeNode(pid, { label: create_propagator_label(p) });
          }

          g.mergeEdge(pid, cid);

          for (const ic of propagator_inputs(p)) {
            const inId = cell_id(ic);
            g.mergeNode(inId, { label: create_cell_label(ic) });
            g.mergeEdge(inId, pid);
            if (!seenCells.has(inId)) q.push(ic);
          }
        }
      }

      if (truncated) {
        console.warn(
          `[tracer] BFS truncated at ${maxNodes} nodes; graph may be incomplete. Consider increasing maxNodes.`
        );
      }

      rebuildCount++;
      if (maxRebuilds != null && rebuildCount >= maxRebuilds) {
        console.warn(
          `[tracer] maxRebuilds (${maxRebuilds}) reached; stopping to prevent infinite loop.`
        );
      }

      const nextSig = graph_signature(g);
      if (nextSig !== lastGraphSig) {
        lastGraphSig = nextSig;
        update_source_cell(gatherer, g);
      }
      onRebuild?.();
    };

    const scheduleRebuild = () => {
      if (!isSelfActive()) {
        disposeAllTaps();
        return;
      }
      if (pending) return;
      if (maxRebuilds != null && rebuildCount >= maxRebuilds) return;
      pending = true;

      // microtask debounce: fast and deterministic for a demo
      queueMicrotask(() => {
        pending = false;
        rebuildGraphOnce();
      });
    };

    self = construct_propagator(
      [root],
      [gatherer],
      () => {
        if (initialized) return;
        initialized = true;
        scheduleRebuild();
      },
      create_tracer_name(cell_name(root)),
      null,
      [NeighborType.updated, NeighborType.updated]
    );

    return self;
  };

  /**
   * Periodic pull-based tracer. Runs on a timer, independent of cell updates.
   * No taps → no feedback loop when gatherer or downstream-of-gatherer cells exist in the graph.
   * Same BFS and graph logic as trace_upstream_reactively.
   */
  export const trace_upstream_periodically = (
    root: Cell<any>,
    gatherer: Cell<any>,
    options: TraceUpstreamPeriodicOptions = {}
  ) => {
    const maxNodes = options.maxNodes ?? TRACER_MAX_NODES;
    const intervalMs = options.intervalMs ?? 400;
    const g = new DirectedGraph();
    let self: Propagator | null = null;
    let intervalId: ReturnType<typeof setInterval> | null = null;
    let lastGraphSig: string | null = null;

    const isSelfActive = () => self != null && cell_neighbor_set(root).has(self);
    const stopInterval = () => {
      if (intervalId != null) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    const rebuildGraphOnce = () => {
      if (!isSelfActive()) {
        stopInterval();
        return;
      }
      g.clear();
      const seenCells = new Set<string>();
      const seenProps = new Set<string>();
      const q: Cell<any>[] = [root];
      let nodeCount = 0;
      let truncated = false;

      while (q.length > 0 && !truncated) {
        const c = q.shift()!;
        const cid = cell_id(c);
        if (seenCells.has(cid)) continue;
        if (nodeCount >= maxNodes) {
          truncated = true;
          break;
        }
        seenCells.add(cid);
        nodeCount++;

        g.mergeNode(cid, { label: create_cell_label(c) });

        for (const p of cell_dependents(c)) {
          if (is_tracer_propagator(p)) continue;
          const pid = propagator_id(p);
          if (!seenProps.has(pid)) {
            if (nodeCount >= maxNodes) {
              truncated = true;
              break;
            }
            seenProps.add(pid);
            nodeCount++;
            g.mergeNode(pid, { label: create_propagator_label(p) });
          }
          g.mergeEdge(pid, cid);
          for (const ic of propagator_inputs(p)) {
            const inId = cell_id(ic);
            g.mergeNode(inId, { label: create_cell_label(ic) });
            g.mergeEdge(inId, pid);
            if (!seenCells.has(inId)) q.push(ic);
          }
        }
      }

      if (truncated) {
        console.warn(
          `[tracer] periodic BFS truncated at ${maxNodes} nodes; graph may be incomplete.`
        );
      }
      const nextSig = graph_signature(g);
      if (nextSig !== lastGraphSig) {
        lastGraphSig = nextSig;
        update_source_cell(gatherer, g);
      }
    };

    self = construct_propagator(
      [root],
      [gatherer],
      () => {
        if (!isSelfActive()) {
          stopInterval();
          return;
        }
        if (intervalId == null) {
          rebuildGraphOnce();
          intervalId = setInterval(() => {
            if (!isSelfActive()) {
              stopInterval();
              return;
            }
            rebuildGraphOnce();
          }, intervalMs);
        }
      },
      make_name([cell_name(root), "tracer", "periodic"]),
      null,
      [NeighborType.updated, NeighborType.updated]
    );

    return self;
  };


// /**
//  * Incremental tracer:
//  * - processes only "dirty" cells whose value changed (via taps)
//  * - expands upstream closure only when structure signatures change
//  * - monotonic graph (no deletions) for demo stability
//  */
// export const trace_upstream_incremental = (root: Cell<any>, gatherer: Cell<any>) =>
//     construct_propagator(
//       [root],
//       [gatherer],
//       () => {
//         const nodes = new Map<string, GraphNode>();
//         const links = new Map<string, GraphLink>();
  
//         // id -> Cell object, so we can process dirty ids
//         const observedCells = new Map<string, Cell<any>>();
//         const tappedCells = new Set<string>();
  
//         // dirty cell ids, and a work queue for upstream expansion
//         const dirty = new Set<string>();
//         const expandQueue: Cell<any>[] = [];
  
//         // cache structural signatures to decide when to expand
//         const cellSig = new Map<string, string>();
//         const propSig = new Map<string, string>();
  
//         let pending = false;
  
//         const scheduleFlush = () => {
//           if (pending) return;
//           pending = true;
//           queueMicrotask(flush);
//         };
  
//         const markDirty = (c: Cell<any>) => {
//           const id = cell_id(c);
//           dirty.add(id);
//           scheduleFlush();
//         };
  
//         const registerCell = (c: Cell<any>) => {
//           const id = cell_id(c);
//           if (!observedCells.has(id)) observedCells.set(id, c);
  
//           if (!tappedCells.has(id)) {
//             tappedCells.add(id);
//             p_tap(c, () => markDirty(c));
//           }
//         };
  
//         const ensureNodeCell = (c: Cell<any>) => {
//           const id = cell_id(c);
//           nodes.set(id, { id, label: create_cell_representation(c) });
//         };
  
//         const ensureNodeProp = (p: Propagator) => {
//           const id = propagator_id(p);
//           nodes.set(id, { id, label: create_propagator_representation(p) });
//         };
  
//         const ensureLink = (source: string, target: string) => {
//           const lid = make_name(["P2C", source, target]);
//           if (!links.has(lid)) links.set(lid, { source, target });
//         };
  
//         const signatureForCell = (c: Cell<any>) => {
//           // structure-only: which propagators depend on this cell
//           return cell_dependents(c)
//             .filter((p) => !is_tracer_propagator(p))
//             .map((p) => propagator_id(p))
//             .sort()
//             .join(",");
//         };
  
//         const signatureForProp = (p: Propagator) => {
//           // structure-only: which input cells feed this propagator
//           return propagator_inputs(p)
//             .map((c) => cell_id(c))
//             .sort()
//             .join(",");
//         };
  
//         const processCell = (c: Cell<any>) => {
//           registerCell(c);
//           ensureNodeCell(c);
  
//           const cid = cell_id(c);
  
//           const newCellSig = signatureForCell(c);
//           const oldCellSig = cellSig.get(cid);
//           const cellStructureChanged = oldCellSig !== newCellSig;
//           if (cellStructureChanged) cellSig.set(cid, newCellSig);
  
//           for (const p of cell_dependents(c)) {
//             if (is_tracer_propagator(p)) continue;
  
//             ensureNodeProp(p);
//             const pid = propagator_id(p);
//             ensureLink(pid, cid);
  
//             const newPropSig = signatureForProp(p);
//             const oldPropSig = propSig.get(pid);
//             const propStructureChanged = oldPropSig !== newPropSig;
//             if (propStructureChanged) propSig.set(pid, newPropSig);
  
//             // Expand upstream only when needed.
//             if (cellStructureChanged || propStructureChanged) {
//               for (const inputCell of propagator_inputs(p)) {
//                 registerCell(inputCell);
  
//                 // If we haven't even created a node for it yet, or structure changed, re-process it.
//                 const inId = cell_id(inputCell);
//                 if (!nodes.has(inId) || cellStructureChanged || propStructureChanged) {
//                   expandQueue.push(inputCell);
//                 }
//               }
//             }
//           }
//         };
  
//         const flush = () => {
//           pending = false;
  
//           // start with dirty observed cells
//           const work: Cell<any>[] = [];
//           for (const id of dirty) {
//             const c = observedCells.get(id);
//             if (c) work.push(c);
//           }
//           dirty.clear();
  
//           // Process dirty cells, then any upstream expansion discovered.
//           while (work.length > 0 || expandQueue.length > 0) {
//             const c = work.length > 0 ? work.pop()! : expandQueue.shift()!;
//             processCell(c);
//           }
  
//           update_source_cell(gatherer, {
//             nodes: Array.from(nodes.values()),
//             links: Array.from(links.values()),
//           });
//         };
  
//         // seed
//         registerCell(root);
//         markDirty(root);
//       },
//       create_tracer_name(cell_name(root)),
//       null,
//       [NeighborType.updated, NeighborType.updated]
//     );
