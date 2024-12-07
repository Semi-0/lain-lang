

import { construct_simple_generic_procedure } from "generic-handler/GenericProcedure"
import type { LayeredObject } from "sando-layer/Basic/LayeredObject"
import type { Environment } from "./environment/environment"

export const evaluate = construct_simple_generic_procedure("evaluate", 3, (expr, env, continuation) => {
    return default_eval(expr, env, continuation)
})

export function default_eval(expr: LayeredObject, env: Environment, continuation: Function): LayeredObject{
    return expr
}

export function is_continuation(any: any): boolean{
    return any instanceof Function
}