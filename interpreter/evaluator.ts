

import { construct_simple_generic_procedure } from "generic-handler/GenericProcedure"
import type { LayeredObject } from "sando-layer/Basic/LayeredObject"
import { define, environment_define, lookup, type Environment } from "./environment/environment"
import { define_match_handler, make_matcher_register, match } from "./matcher"
import { P } from "pmatcher/MatchBuilder"
import { isSucceed } from "pmatcher/Predicates"
import { apply as apply_matched} from "pmatcher/MatchResult/MatchGenericProcs"
import { apply } from "./apply"
import {  expr_define,  expr_primitive_cell_constructor, expr_propagator_constructor, expr_self_evaluate, expr_tell_cell, expr_var } from "./expressions"
import { construct_closure, construct_propagator_expr } from "./environment/closure"
import { get_value } from "../shared/type_layer"
import { expr_application } from "./expressions"
import { construct_primitive_cell, construct_primitive_cell_with_value } from "../network/cell"
import { tell_cell } from "./propagator_wrapper"
export const evaluate = construct_simple_generic_procedure("evaluate", 3, (expr, env, continuation) => {
    return default_eval(expr, env, continuation)
})

type EvalHandler = (exec: (...args: any[]) => any, env: Environment, continuation: (result: LayeredObject, env: Environment) => any) => any

export function default_eval(expr: LayeredObject, env: Environment, continuation: (expr: LayeredObject, env: Environment) => LayeredObject): LayeredObject{
    const application =  match(expr, expr_application)
    if (isSucceed(application)){
        return apply_matched((propagator: LayeredObject, cells: LayeredObject[]) => {
            return apply(continuation(propagator, env), cells, env, continuation)
        })
    }
    return expr
}

define_match_handler(evaluate, expr_self_evaluate,
    ((exec: (...args: any[]) => any, env: Environment, continuation: (result: LayeredObject, env: Environment) => any) => {
        return exec((expr: LayeredObject) => {
            return expr
        })
    }) as EvalHandler
)

define_match_handler(evaluate, expr_var, 
    ((exec: (...args: any[]) => any, env: Environment, continuation: (result: LayeredObject, env: Environment) => any) => {
        return exec((expr: LayeredObject) => {
            return lookup(env, expr)
        })
    }) as EvalHandler
)

define_match_handler(evaluate, expr_propagator_constructor, 
((exec, env, continuation): EvalHandler => {
    return exec((inputs: LayeredObject[], outputs: LayeredObject[], activate: LayeredObject) => {
        return construct_closure(construct_propagator_expr(inputs, outputs, activate), env)
    })
}) as EvalHandler)


define_match_handler(evaluate, expr_primitive_cell_constructor,
    ((exec, env, continuation): EvalHandler => {
        return exec((value: LayeredObject) => {
            return construct_primitive_cell_with_value(value)
        })
    }) as EvalHandler
)

define_match_handler(evaluate, expr_define,
    ((exec, env, continuation): EvalHandler => {
        return exec((name: LayeredObject, value: LayeredObject) => {
           return define(env, name, continuation(value, env))
        })
    }) as EvalHandler
)

define_match_handler(evaluate, expr_tell_cell,
    ((exec, env, continuation): EvalHandler => {
        return exec((cell: LayeredObject, value: LayeredObject) => {
           return tell_cell(continuation(cell, env), continuation(value, env))
        })
    }) as EvalHandler
)

