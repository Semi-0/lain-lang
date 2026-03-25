import { for_each } from "generic-handler/built_in_generics/generic_collection"
import { construct_simple_generic_procedure, define_generic_procedure_handler, error_generic_procedure_handler } from "generic-handler/GenericProcedure"
import { DirectedGraph } from "graphology"
import {  is_cell, match_args } from "ppropogator"
import { cell_dependents, cell_downstream, cell_name, cell_level, cell_strongest_base_value, cell_neighbor_set } from "ppropogator/Cell/Cell"
import { construct_propagator, is_propagator, propagator_inputs, propagator_name, propagator_outputs, propagator_level } from "ppropogator/Propagator/Propagator"
import { at_primitives, get_id } from "ppropogator/Shared/Generics"
import { Cell, Propagator } from "ppropogator"
import { pipe } from "effect"
import { p_tap } from "ppropogator/Propagator/BuiltInProps"
import { update_specialized_reactive_value } from "../../src/grpc/better_runtime"
import { cell_id } from "ppropogator/Cell/Cell"
import { generic_relation_parent_child } from "ppropogator/Shared/Generics"
import { parameterize_parent } from "ppropogator/Shared/PublicState"
import { get_dependents, get_downstream } from "ppropogator/Shared/Generics"
import { curried_filter } from "ppropogator/Helper/Helper"
import { compose } from "generic-handler/built_in_generics/generic_combinator"
import { is_nothing } from "ppropogator/Cell/CellValue"

export const traverse = (
  walk: (x: any) => any[],
  step: (state: any, x: any) => any,
) => (root: any, initial_state: any) => {
  const queue: any[] = [root]
  var state = initial_state

  while (queue.length > 0) {
    const x = queue.shift()

    if (x) {
      state = step(state, x)
      queue.push(...walk(x))
    }
  }

  return state
}

// step combinators 
export const cyclic_prevention_step = (get_id: (x: any) => string) => {
  const seen = new Set<string>()
  return (step: (state: any, x: any) => any) =>
    (state: any, x: any) => {
      if (seen.has(get_id(x))) {
        return state
      }
      else {
        const stepped = step(state, x)
        seen.add(get_id(x))
        return stepped
      }
    }
}

export const max_nodes_step = (max_nodes: number) => {
  var nodes_count = 0
  return (step: (state: any, x: any) => any) =>
    (state: any, x: any) => {
      if (nodes_count >= max_nodes) {
        return state
      }
      else {
        const stepped = step(state, x)
        nodes_count = nodes_count + 1
        return stepped
      }
    }
}

export const create_label = (item: any) => {
  if (is_cell(item)) {
    return cell_name(item)
  }
  else if (is_propagator(item)) {
    return propagator_name(item)
  }
  else {
    return "unknown"
  }
}

/**
 * Structured attributes stored on every graph node.
 * - kind: "cell" | "propagator"
 * - namespace: first segment of the label (e.g. "CARD", "Core", propagator prefix)
 * - relationLevel: nesting depth in the relation tree
 * - value: cell's current strongest base value as a string (cells only, omitted when nothing)
 */
export const node_attrs = (item: any): Record<string, any> => {
  const label = create_label(item)
  const kind = is_cell(item) ? "cell" : "propagator"
  const namespace = label.split("|")[0] ?? "unknown"
  const relationLevel = is_cell(item) ? cell_level(item) : propagator_level(item)

  if (is_cell(item)) {
    const raw = cell_strongest_base_value(item)
    const value = (raw !== undefined && raw !== null && !is_nothing(raw))
      ? String(raw)
      : undefined
    return { label, kind, namespace, relationLevel, ...(value !== undefined ? { value } : {}) }
  }
  return { label, kind, namespace, relationLevel }
}

export const graph_step = (get_nodes: (x: any) => any[]) => (graph: DirectedGraph, item: any) => {
  const node_id = get_id(item)
  const dependents = get_nodes(item)
  graph.mergeNode(node_id, node_attrs(item))
  for_each(dependents, (dependent: any) => {
    graph.mergeNode(get_id(dependent), node_attrs(dependent))
    graph.mergeEdge(node_id, get_id(dependent))
  })
  return graph
}
export const graph_dependents_step = graph_step(get_dependents)

const tap_cell_step = (on_visit: (cell: Cell<any>) => void) => {
  const tapped = new Set<string>()
  return (step: (state: any, x: any) => any) =>
    (state: any, x: any) => {
      const id = get_id(x)
      if (is_cell(x) && (!tapped.has(id))) {
        on_visit(x)
        tapped.add(id)
      }
      return step(state, x)
    }
}

export const cyclic_prevention_walk = (walk: (x: any) => any[]) => {
  const seen = new Set<string>()
  return (x: any) => {
    if (seen.has(get_id(x))) {
      return []
    }
    else {
      seen.add(get_id(x))
      return walk(x)
    }
  }
}

export const trace = (walk_nodes: (x: any) => any[]) => (
  root: Cell<any>,
  gatherer: Cell<any>
): Propagator => {
  var graph = new DirectedGraph();
  var active = false;
  var initialized = false;

  const tap_cell = tap_cell_step((x: Cell<any>) => {
    const tracer = p_tap(x, () => {
      queueMicrotask(() => {
        schedule();
      })
    })

    // so propagator can correct GC tracer
    generic_relation_parent_child(propagator, tracer)
  })

  const construct_traverse_for_graph = () => traverse(
    cyclic_prevention_walk(walk_nodes),
    pipe(
      graph_step(walk_nodes),
      tap_cell,
    )
  )

  const toggle_active = () => {
    active = !active
  }

  const schedule = () => {
    if (active) {
      return
    }
    else {
      toggle_active()
      graph = construct_traverse_for_graph()(root, graph)
      update_specialized_reactive_value(gatherer, cell_id(gatherer), graph)
      toggle_active()
    }
  }

  const propagator = construct_propagator(
    [root],
    [gatherer],
    () => {
      if (initialized) {
        return
      }
      else {
        initialized = true
        schedule()
      }
    },
    "trace_dependents"
  )

  return propagator
}

export const trace_upstream = trace(get_dependents)
export const trace_upstream_primitive = trace(compose(get_dependents, curried_filter(at_primitives)))
export const trace_downstream = trace(get_downstream)

/**
 * Non-reactive (one-shot) trace: traverses the graph once and writes the result to `gatherer`.
 * Does NOT install p_tap on visited cells — safe to use when the gatherer cell is connected
 * to the env (via selective_sync), which would otherwise cause a dead loop with the reactive
 * `trace` variant.
 *
 * Use this in stdlib registrations where the output cell may be read by further combinators
 * that write back into the propagator network.
 */
export const trace_once = (walk_nodes: (x: any) => any[]) => (
  root: Cell<any>,
  gatherer: Cell<any>
): Propagator => {
  return construct_propagator(
    [root],
    [gatherer],
    () => {
      const graph = traverse(
        cyclic_prevention_walk(walk_nodes),
        graph_step(walk_nodes)
      )(root, new DirectedGraph())
      update_specialized_reactive_value(gatherer, cell_id(gatherer), graph)
    },
    "trace_once"
  )
}

export const trace_upstream_once = trace_once(get_dependents)
export const trace_downstream_once = trace_once(get_downstream)

/**
 * Periodic (interval-based) trace: rebuilds the graph at a fixed cadence without
 * installing p_tap on visited cells.
 *
 * Dead-loop safe: subsequent rebuilds are gated behind setInterval, so writes to
 * the gatherer (which may trigger selective_sync → env Map update) cannot cause
 * immediate re-traversal. The update cycle is:
 *   setInterval fires → rebuild graph → write to gatherer → trigger downstream
 *   combinators → (no further traversal until next interval tick)
 *
 * First rebuild is synchronous (happens during the initial propagator fire), so
 * tests using execute_all_tasks_sequential() still get an immediate snapshot.
 *
 * @param walk_nodes  Direction function (get_dependents = upstream, get_downstream = downstream)
 * @param interval_ms Rebuild cadence in milliseconds (default 400)
 */
export const trace_periodic = (walk_nodes: (x: any) => any[], interval_ms: number = 1000) => (
  root: Cell<any>,
  gatherer: Cell<any>
): Propagator => {
  let timer: ReturnType<typeof setInterval> | null = null
  let self: Propagator | null = null

  // Returns true if this tracer is still attached to root; clears the interval if not.
  // This prevents stale timers from firing after init_system() resets state.
  const is_active = (): boolean => {
    if (self === null || !cell_neighbor_set(root).has(self)) {
      if (timer !== null) { clearInterval(timer); timer = null }
      return false
    }
    return true
  }

  const rebuild = () => {
    if (!is_active()) return
    const graph = traverse(
      cyclic_prevention_walk(walk_nodes),
      graph_step(walk_nodes)
    )(root, new DirectedGraph())
    update_specialized_reactive_value(gatherer, cell_id(gatherer), graph)
  }

  self = construct_propagator(
    [root],
    [gatherer],
    () => {
      if (timer !== null) return
      rebuild()                                      // immediate synchronous snapshot
      timer = setInterval(rebuild, interval_ms)      // then periodic refresh
    },
    "trace_periodic"
  )

  return self
}

export const trace_upstream_periodic = trace_periodic(get_dependents)
export const trace_downstream_periodic = trace_periodic(get_downstream)