import { register_predicate } from "generic-handler/Predicates"
import { create_dict_value, default_ref, extend_scoped_value, get_largest_scope, get_value_in_largest_scope, type scoped_value, type ScopeReference } from "./scoped_reference"





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

export const is_environment = register_predicate("is_environment", (A: any): boolean => {
    return A instanceof Map
})

export function lookup_scope(env: Environment, scope: ScopeReference, key: string): any | undefined {
    return env.dict.get(key)?.get(scope)
}

export function lookup(env: Environment, key: string): any | undefined {
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


export function has(env: Environment, key: string): boolean{
    return env.dict.has(key)
}

function extend_environment(env: Environment, key: string, value: scoped_value): Environment{
    const new_env = copy_environment(env)
    new_env.dict.set(key, value)
    return new_env
}

export function extend(env: Environment, key: string, scope: ScopeReference, value: any): Environment{
    const new_env = copy_environment(env)
    const existed = lookup_scope(new_env, scope, key)
    if (existed){
       extend_scoped_value(existed, scope, value)
       return new_env
    }
    else{
        return extend_environment(new_env, key, create_dict_value(value, scope))
    }
}

export function extend_values(env: Environment, keys: string[], values: any[], scope: ScopeReference): Environment{
    const new_env = copy_environment(env)
    keys.forEach((key, index) => {
        new_env.dict.set(key, create_dict_value(values[index], scope))
    })
    return new_env
}
