import { for_each } from "generic-handler/built_in_generics/generic_collection"
import { throw_error } from "generic-handler/built_in_generics/other_generic_helper"
import { construct_simple_generic_procedure, define_generic_procedure_handler, error_generic_procedure_handler } from "generic-handler/GenericProcedure"
import { DirectedGraph } from "graphology"
import { is_cell, match_args } from "ppropogator"
import { cell_dependents, cell_name } from "ppropogator/Cell/Cell"
import { is_propagator, propagator_inputs, propagator_name } from "ppropogator/Propagator/Propagator"
import { get_id } from "ppropogator/Shared/Generics"

export const traverse = (
    walk: (x: any) => any[],
    step: (state: any, x: any) => any,
) => (root: any, initial_state: any) => {
    const queue: any[] = [root]
    var state = initial_state

    while (queue.length > 0) {
        const x = queue.shift()

        if (x){
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

export const graph_step = (graph: DirectedGraph, item: any) => {
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
}