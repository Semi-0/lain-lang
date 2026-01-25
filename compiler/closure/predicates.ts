import { type Cell, function_to_primitive_propagator, register_predicate } from "ppropogator";
import { make_ce_arithmetical } from "ppropogator/Propagator/Sugar";
import { type ClosureTemplate } from "./base";

// need is closure predicate propagator
export const _is_closure = register_predicate("is_closure", (closure: any) => {
    return !!(closure && closure.env && closure.name && closure.inputs && closure.outputs && closure.body)
})

export const p_is_closure = (closure: Cell<any>, output: Cell<boolean>) => function_to_primitive_propagator("is_closure", (c: ClosureTemplate) => {
    return _is_closure(c)
})(closure, output)

export const ce_is_closure = make_ce_arithmetical(p_is_closure, "is_closure") as (closure: Cell<any>) => Cell<boolean>

