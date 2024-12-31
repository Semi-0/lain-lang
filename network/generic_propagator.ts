import { applicative } from "fp-ts";
import { the_nothing, type Cell, type PropagatorFunction } from "../type";
import type { Propagator } from "../type";
import type { Pair } from "./data_types";
import { p_and, p_apply, p_cons, p_equal, p_first, p_not, p_or, p_rest, p_switch, p_write } from "./default_propagator";
import { construct_compound_propagator } from "./propagator";
import { constant_cell, primitive_cell } from "./cell";



export function p_match(args: Cell<Pair<any>>, critic: Cell<PropagatorFunction>, output: Cell<any>){
    return p_apply(args, critic, output)
}


export function p_get_critics_from_applicability(applicability: Cell<Pair<any>>, output: Cell<any>){
    return p_first(applicability, output)
}

export function p_get_handler_from_applicability(applicability: Cell<Pair<any>>, output: Cell<any>){
    return p_rest(applicability, output)
}

export function get_handler(store: Cell<Pair<Pair<any>>>, args: Cell<Pair<any>>, output: Cell<PropagatorFunction>){

    return construct_compound_propagator(new Set([store, args]), new Set([output]), () => {
        const done = primitive_cell<boolean>();
        const input = primitive_cell<Pair<any>>();
        const rest_of_store = primitive_cell<Pair<Pair<any>>>();
        const critics = primitive_cell<PropagatorFunction>();
        const critics_result = primitive_cell<boolean>();
        const handler = primitive_cell<PropagatorFunction>();
        const false_cell = constant_cell(false)
        const first_suspended = primitive_cell<Pair<any>>()
        const first = primitive_cell<Pair<any>>()
        const reach_end_of_store = constant_cell(false)
        const not_reach_end_of_store = constant_cell(true)
        const found_matched_critics = constant_cell(false)
        const critics_not_matched = primitive_cell<boolean>()
        const result = primitive_cell<any>()
        
        // connect input to args
        p_write(input, args)

        // check if done 
        p_switch(done, result, output)
        p_or(reach_end_of_store, found_matched_critics, done)

        // check if we reach the end of the store
        p_equal(rest_of_store, constant_cell(the_nothing), reach_end_of_store)
        p_not(reach_end_of_store, not_reach_end_of_store)

        // if reach the end of the store, write false to output
        p_switch(reach_end_of_store, false_cell, result)

        // if not reach the end of the store, get the first element
        p_first(store, first_suspended)
        p_switch(not_reach_end_of_store, first_suspended, first)

        // get the critics from the first element
        p_get_critics_from_applicability(first, critics)

        // get the handler from the first element
        p_get_handler_from_applicability(first, handler)

        // apply the critics to the args
        p_apply(args, critics, critics_result)

        // switch the result of the critics to the handler
        p_switch(critics_result, handler, result)
        p_switch(critics_result, constant_cell(true), found_matched_critics)
        p_not(found_matched_critics, critics_not_matched)

        // get the rest of the store
        p_rest(store, rest_of_store)
        p_switch(critics_not_matched, rest_of_store, input)
    })
}