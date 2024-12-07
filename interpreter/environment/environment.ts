import { register_predicate } from "generic-handler/Predicates"
import { create_dict_value, default_ref, extend_scoped_value, type scoped_value, type ScopeReference } from "./scoped_reference"
import type { Env } from "bun"
import { isElementAccessExpression } from "typescript"

export type Environment = {
    dict: Map<string, scoped_value>,
    ref: ScopeReference
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

export function lookup(env: Environment, scope: ScopeReference, key: string): any | undefined {
    return env.dict.get(key)?.get(scope)
}

export function has(env: Environment, key: string): boolean{
    return env.dict.has(key)
}

function extend_environment(env: Environment, key: string, value: scoped_value): Environment{
    env.dict.set(key, value)
    return env
}

export function extend(env: Environment, key: string, scope: ScopeReference, value: any): Environment{
    const existed = lookup(env, scope, key)
    if (existed){
       extend_scoped_value(existed, scope, value)
       return env
    }
    else{
        return extend_environment(env, key, create_dict_value(value, scope))
    }
}

