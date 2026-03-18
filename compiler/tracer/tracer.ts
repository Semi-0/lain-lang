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
import { update_specialized_reactive_value } from "../../src/grpc/better_runtime";

export type GraphNode = { id: string; label: string };
export type GraphLink = { source: string; target: string };
export type Graph = { nodes: GraphNode[]; links: GraphLink[] };

const TRACER_MAX_NODES = 2000;

const tracer_name = (name: string) => make_name([name, "tracer"]);
const is_tracer_propagator = (p: Propagator) => propagator_name(p).includes("tracer");

function graph_signature(g: DirectedGraph): string {
  const nodes = g.nodes().map((id) => `${id}:${String(g.getNodeAttribute(id, "label") ?? "")}`).sort();
  const edges = g.edges().map((k) => `${g.source(k)}->${g.target(k)}`).sort();
  return `${nodes.join(";")}||${edges.join(";")}`;
}

/** Upstream BFS from root; fills graph. Optional on_visit(cell, id) per cell. Returns truncated. */
function upstream_bfs(
  graph: DirectedGraph,
  root: Cell<any>,
  max_nodes: number,
  on_visit?: (cell: Cell<any>, id: string) => void
): boolean {
  graph.clear();
  const seen_cells = new Set<string>();
  const seen_props = new Set<string>();
  const queue: Cell<any>[] = [root];
  let nodes = 0;
  let truncated = false;

  while (queue.length > 0 && !truncated) {
    const cell = queue.shift()!;
    const cid = cell_id(cell);
    if (seen_cells.has(cid)) {
      continue;
    }
    else if (nodes >= max_nodes) {
      truncated = true;
      break;
    }
    else {

      seen_cells.add(cid);
      nodes = nodes + 1;

      if (on_visit !== undefined) {
        on_visit(cell, cid);
      }

      graph.mergeNode(cid, { label: create_cell_label(cell) });

      for (const prop of cell_dependents(cell)) {
        if (is_tracer_propagator(prop)) {
          continue;
        }
        else {
          const pid = propagator_id(prop);
          if (seen_props.has(pid)) {
            graph.mergeEdge(pid, cid);
            for (const input of propagator_inputs(prop)) {
              const iid = cell_id(input);
              graph.mergeNode(iid, { label: create_cell_label(input) });
              graph.mergeEdge(iid, pid);
              if (!seen_cells.has(iid)) queue.push(input);
            }
          }
          else {
            if (nodes >= max_nodes) {
              truncated = true;
              break;
            }
            else {
              seen_props.add(pid);
              nodes = nodes + 1;
              graph.mergeNode(pid, { label: create_propagator_label(prop) });
              graph.mergeEdge(pid, cid);
              for (const input of propagator_inputs(prop)) {
                const iid = cell_id(input);
                graph.mergeNode(iid, { label: create_cell_label(input) });
                graph.mergeEdge(iid, pid);
                if (!seen_cells.has(iid)) queue.push(input);
              }
            }
          }
        }
      }
    }
  }
  return truncated;
}

function emit_if_changed(
  graph: DirectedGraph,
  gatherer: Cell<any>,
  last_sig: string | null
): string | null {
  const sig = graph_signature(graph);
  if (sig !== last_sig) {
    // update_source_cell(gatherer, graph);
    update_specialized_reactive_value(gatherer, cell_id(gatherer), graph);
    return sig;
  }
  return last_sig;
}

function warn_truncated(max_nodes: number, label: string): void {
  console.warn(`[tracer] ${label} BFS truncated at ${max_nodes} nodes; graph may be incomplete.`);
}

function warn_max_rebuilds(max: number): void {
  console.warn(`[tracer] maxRebuilds (${max}) reached; stopping to prevent infinite loop.`);
}

/** Returns true if tracer is still attached to root; otherwise runs on_inactive and returns false. */
function guard_active(
  root: Cell<any>,
  self: Propagator | null,
  on_inactive: () => void
): boolean {
  if (self == null || !cell_neighbor_set(root).has(self)) {
    on_inactive();
    return false;
  }
  return true;
}

function dispose_taps(taps: Map<string, Propagator>, tapped: Set<string>): void {
  for (const tap of taps.values()) dispose_propagator(tap);
  taps.clear();
  tapped.clear();
}

export type TraceUpstreamOptions = {
  maxNodes?: number;
  maxRebuilds?: number;
  onRebuild?: () => void;
};

export type TraceUpstreamPeriodicOptions = {
  maxNodes?: number;
  intervalMs?: number;
};

type RebuildOpts = {
  on_visit?: (cell: Cell<any>, id: string) => void;
  truncate_label?: string;
  on_after?: () => void;
};

/** Shared rebuild: BFS, optional per-cell visitor, truncate warn, emit if changed, on_after. */
function rebuild_core(
  graph: DirectedGraph,
  root: Cell<any>,
  max_nodes: number,
  gatherer: Cell<any>,
  last_sig: string | null,
  opts: RebuildOpts = {}
): string | null {
  const truncated = upstream_bfs(graph, root, max_nodes, opts.on_visit);
  if (truncated && opts.truncate_label) warn_truncated(max_nodes, opts.truncate_label);
  const next_sig = emit_if_changed(graph, gatherer, last_sig);
  opts.on_after?.();
  return next_sig;
}

function attach_tap_if_needed(
  cell: Cell<any>,
  id: string,
  gatherer_id: string,
  tapped: Set<string>,
  taps: Map<string, Propagator>,
  on_fire: () => void
): void {
  if (id === gatherer_id || tapped.has(id)) return;
  tapped.add(id);
  taps.set(id, p_tap(cell, on_fire));
}

export function trace_upstream_reactively(
  root: Cell<any>,
  gatherer: Cell<any>,
  options: TraceUpstreamOptions = {}
): Propagator {
  const max_nodes = options.maxNodes ?? TRACER_MAX_NODES;
  const max_rebuilds = options.maxRebuilds;
  const on_rebuild = options.onRebuild;
  const tapped = new Set<string>();
  const taps = new Map<string, Propagator>();
  const graph = new DirectedGraph();
  let initialized = false;
  let pending = false;
  let rebuild_count = 0;
  let last_sig: string | null = null;
  let self: Propagator | null = null;

  const active = () => guard_active(root, self, () => dispose_taps(taps, tapped));

  const schedule = () => {
    if (!active()) return;
    if (pending || (max_rebuilds != null && rebuild_count >= max_rebuilds)) return;
    pending = true;
    queueMicrotask(() => {
      pending = false;
      if (!active()) return;
      const gatherer_id = cell_id(gatherer);
      const on_fire = () => {
        if (!active()) return;
        if (max_rebuilds != null && rebuild_count >= max_rebuilds) return;
        schedule();
      };
      const on_visit = (cell: Cell<any>, id: string) =>
        attach_tap_if_needed(cell, id, gatherer_id, tapped, taps, on_fire);
      last_sig = rebuild_core(graph, root, max_nodes, gatherer, last_sig, {
        on_visit,
        truncate_label: "BFS",
        on_after: () => {
          rebuild_count++;
          if (max_rebuilds != null && rebuild_count >= max_rebuilds) warn_max_rebuilds(max_rebuilds);
          on_rebuild?.();
        },
      });
    });
  };

  self = construct_propagator(
    [root],
    [gatherer],
    () => {
      if (initialized) return;
      initialized = true;
      schedule();
    },
    tracer_name(cell_name(root)),
    null,
    [NeighborType.updated, NeighborType.updated]
  );
  return self;
}

function stop_periodic(handle: ReturnType<typeof setInterval> | null): null {
  if (handle != null) clearInterval(handle);
  return null;
}

export function trace_upstream_periodically(
  root: Cell<any>,
  gatherer: Cell<any>,
  options: TraceUpstreamPeriodicOptions = {}
): Propagator {
  const max_nodes = options.maxNodes ?? TRACER_MAX_NODES;
  const interval_ms = options.intervalMs ?? 400;
  const graph = new DirectedGraph();
  let self: Propagator | null = null;
  let interval: ReturnType<typeof setInterval> | null = null;
  let last_sig: string | null = null;

  const active = () => guard_active(root, self, () => { interval = stop_periodic(interval); });

  const rebuild_once = () => {
    if (!active()) return;
    last_sig = rebuild_core(graph, root, max_nodes, gatherer, last_sig, {
      truncate_label: "periodic",
    });
  };

  const start_interval = () => {
    if (interval != null) return;
    rebuild_once();
    interval = setInterval(() => {
      if (!active()) return;
      rebuild_once();
    }, interval_ms);
  };

  self = construct_propagator(
    [root],
    [gatherer],
    () => {
      if (!active()) return;
      start_interval();
    },
    make_name([cell_name(root), "tracer", "periodic"]),
    null,
    [NeighborType.updated, NeighborType.updated]
  );
  return self;
}
