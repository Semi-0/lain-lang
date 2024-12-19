import { construct_simple_generic_procedure, define_generic_procedure_handler } from "generic-handler/GenericProcedure";
import { match_args } from "generic-handler/Predicates";
import { is_closure, type Closure } from "./environment/closure";
import { extend,  is_environment, lookup_raw, lookup_scope, new_sub_environment, type Environment } from "./environment/environment";
import { is_continuation } from "../shared/predicates";
import type { LayeredObject } from "sando-layer/Basic/LayeredObject";
import { construct_compound_propagator, construct_propagator } from "../network/propagator";
import { get_value } from "../shared/type_layer";
import type { Propagator } from "../type";
import { wrapped_construct_compound_propagator } from "./propagator_wrapper";
import { is_array } from "generic-handler/built_in_generics/generic_predicates";


export const apply = construct_simple_generic_procedure("apply", 4, (propagator, cells, env, continuation) => {
   throw new Error("Not implemented")
})


define_generic_procedure_handler(apply, 
    match_args(is_closure, is_array, is_environment, is_continuation),
    (closure, cells, env, continuation) => {
        return apply_closure(closure, cells, env, continuation)
    }
)


function apply_closure(closure: Closure, 
    cells_expr: LayeredObject[], 
    env: Environment, 
    continuation: (expr: LayeredObject, env: Environment) => any): Propagator {
    const { inputs: input_exprs, outputs: output_exprs, body } = closure.propagator_expr
    const required = input_exprs.length + output_exprs.length
    
    if (cells_expr.length < required) {
        throw new Error(`Too few cells: ${cells_expr.length} < ${required}`)
    }

    const [inputs, outputs] = [
        cells_expr.slice(0, input_exprs.length).map(cell => continuation(cell, env)),
        cells_expr.slice(input_exprs.length, required).map(cell => continuation(cell, env))
    ]

    return wrapped_construct_compound_propagator(
        inputs, 
        outputs, 
        continuation(body, extend(new_sub_environment(env), cells_expr, [...inputs, ...outputs]))
    )
}