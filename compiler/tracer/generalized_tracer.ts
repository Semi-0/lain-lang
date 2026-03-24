import { for_each } from "generic-handler/built_in_generics/generic_collection"
import { construct_simple_generic_procedure, define_generic_procedure_handler, error_generic_procedure_handler } from "generic-handler/GenericProcedure"
import { DirectedGraph } from "graphology"
import { is_cell, match_args } from "ppropogator"
import { cell_dependents, cell_name } from "ppropogator/Cell/Cell"
import { construct_propagator, is_propagator, propagator_inputs, propagator_name } from "ppropogator/Propagator/Propagator"
import { get_id } from "ppropogator/Shared/Generics"
import { Cell, Propagator } from "ppropogator"
import { pipe } from "effect"
import { p_tap } from "ppropogator/Propagator/BuiltInProps"
import { update_specialized_reactive_value } from "../../src/grpc/better_runtime"
import { cell_id } from "ppropogator/Cell/Cell"
import { log_tracer } from "generic-handler/built_in_generics/generic_debugger"

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

export const get_dependents = construct_simple_generic_procedure(
  "get_dependents",
  1,
  error_generic_procedure_handler("get_dependents")
)

define_generic_procedure_handler(
  get_dependents,
  match_args(is_cell),
  cell_dependents
)

define_generic_procedure_handler(
  get_dependents,
  match_args(is_propagator),
  propagator_inputs
)

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

export const graph_dependents_step = (graph: DirectedGraph, item: any) => {
  const node_id = get_id(item)
  const dependents = get_dependents(item)
  graph.mergeNode(
    node_id,
    {
      label: create_label(item)
    }
  )
  for_each(dependents, (dependent: any) => {
    const dependent_id = get_id(dependent)
    graph.mergeNode(
      dependent_id,
      {
        label: create_label(dependent)
      }
    )
    graph.mergeEdge(node_id, dependent_id)
  })
  return graph
}

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

// actually the best way to do this is 
// to treat traced graph as a partial information 
export function trace_dependents(
  root: Cell<any>,
  gatherer: Cell<any>
): Propagator {

  var graph = new DirectedGraph();
  var active = false;
  var initialized = false;

  const tap_cell = tap_cell_step((x: Cell<any>) => {
    p_tap(x, () => {
      queueMicrotask(() => {
        schedule();
      })
    })
  })

  const construct_traverse_for_graph = () => traverse(
    cyclic_prevention_walk(get_dependents),
    pipe(
      graph_dependents_step,
      tap_cell,
      // cyclic_prevention_step(get_id),
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

  // it should traverse all dependents once and tapping all the cell 

  return construct_propagator(
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
}

