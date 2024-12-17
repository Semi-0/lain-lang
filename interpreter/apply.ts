import { construct_simple_generic_procedure, define_generic_procedure_handler } from "generic-handler/GenericProcedure";
import { match_args } from "generic-handler/Predicates";
import { is_closure, type Closure } from "./environment/closure";
import { is_any } from "generic-handler/built_in_generics/generic_predicates";
import { isArray } from "pmatcher/GenericArray";
import { extend_values, is_environment, lookup, lookup_scope, type Environment } from "./environment/environment";
import { is_continuation } from "./evaluator";
import type { LayeredObject } from "sando-layer/Basic/LayeredObject";
import { construct_compound_propagator, construct_propagator } from "../network/propagator";
import { get_value } from "../shared/type_layer";
import type { Propagator } from "../type";


export const apply = construct_simple_generic_procedure("apply", 4, (propagator, cells, env, continuation) => {
   throw new Error("Not implemented")
})


define_generic_procedure_handler(apply, 
    match_args(is_closure, isArray, is_environment, is_continuation),
    (closure, cells, env, continuation) => {
        return apply_closure(closure, cells, env, continuation)
    }
)


function apply_closure(closure: Closure, 
    cells_expr: LayeredObject[], 
    env: Environment, 
    continuation: (expr: LayeredObject, env: Environment) => any): Propagator{
    const symbols = cells_expr.map(symbol => get_value(symbol))
    
    const cells = symbols.map(symbol => {
        return lookup(env, symbol)
    })

    const inputs_length = closure.propagator_expr.inputs.length
    const outputs_length = closure.propagator_expr.outputs.length

    if (cells.length < inputs_length + outputs_length) {
        throw new Error("Too few cells: " + cells.length + 
            " < " + (inputs_length + outputs_length))
    }

    const inputs = cells.slice(0, inputs_length)
    const outputs = cells.slice(inputs_length, inputs_length + outputs_length)
    return construct_compound_propagator(inputs, outputs, continuation(closure.propagator_expr.body,
        extend_values(env, symbols, cells, env.ref + 1)
     ))
}