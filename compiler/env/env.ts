import { register_predicate } from "generic-handler/Predicates"

import { expr_value, type LainElement } from "../lain_element"
import { type Cell, cell_name, compound_propagator, construct_cell } from "ppropogator"
import { ce_constant, ce_identity, p_sync } from "ppropogator/Propagator/BuiltInProps"
import { cell_id, cell_strongest_base_value } from "ppropogator/Cell/Cell"
import { generic_wrapper } from "generic-handler/built_in_generics/generic_wrapper"
import { c_dict_accessor, ce_dict, ce_dict_accessor, ce_struct, p_struct } from "ppropogator/DataTypes/CarriedCell"
import { is_map } from "ppropogator/Helper/Helper"
// import {
//     p_scoped_patch,
//     p_sync_back_most_outside
// } from "./scoped_patch"

import { p_pioritize_leftmost } from "../selector"
import { ce_snapshot } from "../dynamic_propagator"


// lets use linked list for 1st iteration first
// there are faster way to do that
// but it requires more complex implementation

// think about DAG
// that would be fun but lets deal with that later..

// now lexical environment itself is just a cell carrier
export type LexicalEnvironment = Cell<Map<string, Cell<any>>>



// maybe give env an identity
export const is_lexical_environment = register_predicate("is_lexical_environment", (x: any) => {
    return x !== undefined && x !== null && typeof x === "object" && "parent" in x && "variables" in x
})


export const parent_key =  "parent"


// @ts-ignore
export const p_construct_env = (parent: Cell<LexicalEnvironment>, id: string = "root", output: Cell<LexicalEnvironment>) => p_struct({ parent: parent})(output)

// identity need to be unique
export const construct_env = (parent: Cell<LexicalEnvironment>, id: string = "root") => ce_struct(
    {
        parent: parent,

    }
) 

export const empty_lexical_environment = (id: string) => construct_env(construct_cell("root"), id)


export const  construct_env_with_inital_value = (initial: [string, Cell<any>][], id: string) => ce_dict(new Map<string, Cell<any>>([[parent_key, construct_cell("root")], ...initial]), id)

// this needs abstraction 

export const extend_env = (parent: LexicalEnvironment, pairs: [string, Cell<any>][]) => ce_dict(new Map<string, Cell<any>>([[parent_key, parent], ...pairs]))

export const summarize_env: (env: LexicalEnvironment) => string  = (env: LexicalEnvironment) => {
    const map = cell_strongest_base_value(env)

    if (is_map(map)) {
    const parent = ce_dict_accessor(parent_key)(env)
    const parent_summarize = summarize_env(parent)
        return Array.from((map as Map<string, Cell<any>>).entries()).map(([key, value]: [string, Cell<any>]) => {
            if (key === parent_key) {
                return parent_summarize
            }

            return `${key}: ${value.summarize()}`
        }).reduce(((a: string, b: string) => a + '\n' + b), '')
    }
    else {
        return env.summarize()
    }

}



// a more general lookup which handles contradiction via temporary value set

// a performance hack in here could be 
// if the same key and env are already calculated
// we don't need to create a new one
// this has a potential bug
// if external cell is updated ealier than internal cell
// then the lookup propagator would flood twice and causing contradiction 

// maybe in the output side it should gice cell calculate internally a stronger intensity?
// however this problem would only occur upon first seed 
// after the first one then it would be fine 

// or give scope a dependence
// and the more consistent a scope is the stronger it is  
// or we limit only get closure from parent scope?
export const p_lexical_lookup = (key: string, env: LexicalEnvironment, output: Cell<any>) =>
    compound_propagator([env], [output], () => {

            if (cell_name(env) === "root") {
                return;
            }

            // lookup parent
            const parent_scope_value = construct_cell("parent_cell")
            p_lexical_lookup(key, get_parent_env(env), parent_scope_value)

            // current scope
            const current_scope_value = ce_dict_accessor(key)(env)
            p_pioritize_leftmost([current_scope_value, parent_scope_value], output)
 

}, "lexical_lookup")

export const self_reflective_lexical_lookup = (key: string, env: LexicalEnvironment, output: Cell<any>) => compound_propagator([env], [output], () => {

    if (key === "env") {
        const global_env = ce_identity(env)
        // shit all the cell is still mutable!!!

        const lexical_result = construct_cell("lexical_result")
        p_lexical_lookup(key, env, lexical_result)

        p_pioritize_leftmost([lexical_result, global_env], output)
    }
    else {
        p_lexical_lookup(key, env, output)
    }

}, "self_reflective_lexical_lookup")

export const self_reflective_lexical_lookup_safe = (key: string, env: LexicalEnvironment, output: Cell<any>) =>  {

    if (key === "env") {
        const global_env = ce_snapshot(env)
        // this is a more safe version because it disable original env
        // from being mutated

        const lexical_result = construct_cell("lexical_result")
        p_lexical_lookup(key, env, lexical_result)

        p_pioritize_leftmost([lexical_result, global_env], output)
    }
    else {
        p_lexical_lookup(key, env, output)
    }

}




export const bind_to_env = (key: string, input: Cell<any>, env: LexicalEnvironment ) => c_dict_accessor(key)(env, input)

// only the 0 distance is bi-directional, other distance are unidirectional
// how can we do that?
export const cached_lookup_maker = (lookup: (key: string, env: LexicalEnvironment) => Cell<any>) => {
    const cache = new Map<string, Cell<any>>()

    return (key: string, env: LexicalEnvironment) => {
        const cached_key = key + " | " + cell_id(env)
        const cached_value = cache.get(cached_key)
        if (cached_value != undefined) {
            return cached_value
        }
        else {
            const new_value = lookup(key, env)
            cache.set(cached_key, new_value)
            return new_value
        }
    }
}





export const ce_lexical_lookup = (key: string, env: LexicalEnvironment) =>  {
    const assesor = construct_cell(key + " | " + "accessor")
    self_reflective_lexical_lookup_safe(key, env, assesor)
    return assesor
}

export const ce_cached_lexical_lookup = cached_lookup_maker(ce_lexical_lookup)


export const ce_lookup_from_expr = generic_wrapper(
    ce_cached_lexical_lookup,
    (x) => x,
    expr_value,
    (x) => x,
)


export const lexical_lookup_from_expr = generic_wrapper(
    p_lexical_lookup,
    (x) => x,
    expr_value,
    (x) => x,
    (x) => x
)

// lexical lookup introduce and look up the value simutaniously 

export const lookup = lexical_lookup_from_expr


export const define = (key: LainElement, env: LexicalEnvironment, value: Cell<any>) => compound_propagator(
    // bug is in here!!
    // maybe because env doesn't have independent 
    // victor clock
    // so victor clock believe they are out of sync?
    [value],
    [env],
    () => {
        c_dict_accessor(expr_value(key))(env as unknown as Cell<Map<string, any>>, value)
    },
    "define"
)



export const introduce = (key: LainElement, env: LexicalEnvironment, output: Cell<any>) => {
    return lookup(key, env, output)
}

export const extend = construct_env


export const get_parent_env = (env: LexicalEnvironment) => ce_dict_accessor(parent_key)(env)
