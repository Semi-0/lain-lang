import { match_args, register_predicate } from "generic-handler/Predicates"
import { create_dict_value, default_ref, extend_scoped_value, get_largest_scope, get_value_in_largest_scope, type scoped_value, type ScopeReference } from "./scoped_reference"
import { construct_layered_procedure_metadata, define_layered_procedure_handler, make_layered_procedure } from "sando-layer/Basic/LayeredProcedure"
import { get_type_annotate, get_value, type_layer } from "../../shared/type_layer"
import { is_layered_object, type LayeredObject } from "sando-layer/Basic/LayeredObject"
import { is_layer, type Layer } from "sando-layer/Basic/Layer"
import { construct_simple_generic_procedure, define_generic_procedure_handler } from "generic-handler/GenericProcedure"
import { throw_error } from "generic-handler/built_in_generics/other_generic_helper"
import { throw_unimplemented } from "../../shared/helper"
import { is_array, is_string } from "generic-handler/built_in_generics/generic_predicates"
import { zip } from "fp-ts/lib/Array"
import { reduce } from "pmatcher/GenericArray"





export type Environment = {
    dict: Map<string, scoped_value>,
    ref: ScopeReference
}

export function copy_environment(env: Environment): Environment{
    return {
        dict: new Map(env.dict),
        ref: env.ref
    }
}


export function empty_environment(): Environment{
    return {
        dict: new Map(),
        ref: default_ref()
    }
}

export function new_sub_environment(env: Environment): Environment{
    const new_env = copy_environment(env)
    new_env.ref = new_env.ref + 1
    return new_env
}

export const is_environment = register_predicate("is_environment", (A: any): boolean => {
    return A instanceof Map
})

export function lookup_scope(env: Environment, scope: ScopeReference, key: string): any | undefined {
    return env.dict.get(key)?.get(scope)
}

export function lookup_raw(env: Environment, key: string): any | undefined {
    if (env.dict.has(key)){
        const value = env.dict.get(key)
        if ((value !== undefined) && (get_largest_scope(value) < env.ref)){
            return get_value_in_largest_scope(value)
        }
        else{
            return undefined
        }
    }
    else{
        return undefined
    }
}

export const lookup = make_layered_procedure("lookup", 2, (env, key) => {
    return lookup_raw(env, key)
}) 

define_layered_procedure_handler(lookup, type_layer, (base: LayeredObject, env: Layer, key: Layer) =>{
    return get_type_annotate(base)
})

export function has(env: Environment, key: string): boolean{
    return env.dict.has(key)
}

function extend_environment(env: Environment, key: string, value: scoped_value): Environment{
    const new_env = copy_environment(env)
    new_env.dict.set(key, value)
    return new_env
}

export function extend_value(env: Environment, key: string, value: any): Environment{
    const new_env = copy_environment(env)
    const existed = lookup_scope(new_env, new_env.ref, key)
    if (existed){
       extend_scoped_value(existed, new_env.ref, value)
       return new_env
    }
    else{
        return extend_environment(new_env, key, create_dict_value(value, new_env.ref))
    }
}

export function environment_define(env: Environment, name: string, value: LayeredObject){
    if (env.dict.has(name)){
        throw new Error(`Variable ${name} already defined`)
    }
    env.dict.set(name, create_dict_value(value, env.ref))
    return env
}

export const define = construct_simple_generic_procedure("define", 3, throw_unimplemented)

define_generic_procedure_handler(define,
    match_args(is_environment, is_string, is_layered_object),
    (env, name, value) => {
        return environment_define(env, name, value)
    }
)

define_generic_procedure_handler(define,
    match_args(is_environment, is_layered_object, is_layered_object),
    (env, name, value) => {
        return environment_define(env, get_value(name), value)
    }
)


export const extend = construct_simple_generic_procedure("extend", 3, throw_unimplemented)

define_generic_procedure_handler(extend, 
    match_args(
        is_environment, is_string, is_layered_object
    ),
    (env, key, value) => {
        return extend_value(env, key, value)
    }
)

define_generic_procedure_handler(extend,
    match_args(is_environment, is_array, is_array), 
    (env, keys, values) => {
        return reduce(zip(keys, values), (env, [key, value]) => {
            return extend(env, key, value)
        }, env)
    }
)

define_generic_procedure_handler(extend, 
    match_args(is_environment, is_layered_object, is_layered_object),
    (env, key, value) => {
        return extend(env, get_value(key), value)
 })