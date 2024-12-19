import { register_predicate } from "generic-handler/Predicates"
import { is_type } from "./type_layer"
import { LispType } from "./type_layer"

export const is_scheme_symbol = register_predicate("is_scheme_symbol", is_type(LispType.symbol))

export const is_scheme_string = register_predicate("is_scheme_string", is_type(LispType.string))

export const is_scheme_number = register_predicate("is_scheme_number", is_type(LispType.number))

export const is_scheme_boolean = register_predicate("is_scheme_boolean", is_type(LispType.boolean))

export const is_scheme_cell_boolean = register_predicate("is_scheme_cell_boolean", is_type(LispType.cell_boolean))

export const is_self_evaluate = register_predicate("is_self_evaluate", (a: any) => {
    return is_scheme_string(a) || is_scheme_number(a) || is_scheme_boolean(a) || is_scheme_cell_boolean(a)
})

export const is_scheme_quoted = register_predicate("is_scheme_quoted", is_type(LispType.quoted))

export const is_scheme_list = register_predicate("is_scheme_list", is_type(LispType.list))

export const is_scheme_cell = register_predicate("is_scheme_cell", is_type(LispType.cell))

export const is_scheme_propagator = register_predicate("is_scheme_propagator", is_type(LispType.propagator))

export const is_scheme_closure = register_predicate("is_scheme_closure", is_type(LispType.closure))