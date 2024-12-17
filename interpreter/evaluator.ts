

import { construct_simple_generic_procedure } from "generic-handler/GenericProcedure"
import type { LayeredObject } from "sando-layer/Basic/LayeredObject"
import type { Environment } from "./environment/environment"
import { define_match_handler, make_matcher_register, match } from "./matcher"
import { P } from "pmatcher/MatchBuilder"
import { isSucceed } from "pmatcher/Predicates"
import { apply as apply_matched} from "pmatcher/MatchResult/MatchGenericProcs"
import { apply } from "./apply"
import { expr_detailed_propagator_constructor, expr_propagator_constructor } from "./expressions"
import { construct_closure, construct_propagator_expr } from "./environment/closure"
export const evaluate = construct_simple_generic_procedure("evaluate", 3, (expr, env, continuation) => {
    return default_eval(expr, env, continuation)
})

type EvalHandler = (exec: (...args: any[]) => any, env: Environment, continuation: (result: LayeredObject, env: Environment) => any) => any


const application_expr = make_matcher_register([[P.element, "propagator"], [P.segment, "cells"]])

export function default_eval(expr: LayeredObject, env: Environment, continuation: (expr: LayeredObject, env: Environment) => LayeredObject): LayeredObject{
    const application =  match(expr, application_expr)
    if (isSucceed(application)){
        return apply_matched((propagator: LayeredObject, cells: LayeredObject[]) => {
            return apply(continuation(propagator, env), cells, env, continuation)
        })
    }
    return expr
}

define_match_handler(evaluate, expr_propagator_constructor, 
((exec, env, continuation): EvalHandler => {
    return exec((inputs: LayeredObject[], outputs: LayeredObject[], activate: LayeredObject) => {
        return construct_closure(construct_propagator_expr(inputs, outputs, activate), env)
    })
}) as EvalHandler)


export function is_continuation(any: any): boolean{
    return any instanceof Function
}