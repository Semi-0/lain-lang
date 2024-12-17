import type { LayeredObject } from "sando-layer/Basic/LayeredObject"
import type { Environment } from "./environment"
import { register_predicate } from "generic-handler/Predicates"
export type PropagatorExpr = {
    inputs: LayeredObject[],
    outputs: LayeredObject[],
    body: LayeredObject
}

export function construct_propagator_expr(inputs: LayeredObject[], outputs: LayeredObject[], body: LayeredObject): PropagatorExpr{
    return {
        inputs: inputs,
        outputs: outputs,
        body: body
    }
}

export const is_propagator_expr = register_predicate("is_propagator_expr", (expr: any) => {
    return expr !== null && 
        typeof expr === "object" && 
        "inputs" in expr && 
        "outputs" in expr && 
        "body" in expr
})

export function construct_closure(propagator_expr: PropagatorExpr, env: Environment): Closure{
    return {
        propagator_expr: propagator_expr,
        env: env
    }
}

export type Closure = {
    propagator_expr: PropagatorExpr,
    env: Environment
}

export const is_closure = register_predicate("is_closure", (any: any) => {
    return any !== null && typeof any === "object" && "propagator_expr" in any && "env" in any
})