import { compose } from "generic-handler/built_in_generics/generic_combinator"
import { register_predicate } from "generic-handler/Predicates"
import { construct_cell } from "ppropogator"
import { ce_constant } from "ppropogator/Propagator/BuiltInProps"
import { define_generic_predicate } from "./compiler_helper"
import { to_string } from "generic-handler/built_in_generics/generic_conversation"
import { source_cell } from "ppropogator/DataTypes/PremisesSource"
import { ce_cons } from "ppropogator/DataTypes/CarriedCell"
import { construct_layered_datum } from "sando-layer/Basic/LayeredDatum"
import { v4 as uuidv4 } from 'uuid';
import { construct_vector_clock, vector_clock_layer } from "ppropogator/AdvanceReactivity/vector_clock"
import { make_absolute_naming, make_absolute_naming_string } from "./naming_chain"
import { get_new_reference_count } from "ppropogator/Helper/Helper"

export enum LainType {
    string = "String",
    number = "Number",
    boolean = "Boolean",
    symbol = "Symbol",
    quoted = "Quoted",
    expression = "Expression",
    lambda = "Lambda",
    let = "Let",
    call = "Call",
    closure = "Closure",
    primitivePropagator = "PrimitivePropagator",
    network = "Network",
    cell = "Cell",
    propagator = "Propagator",
 
}




export interface LainElement {
    type: LainType
    value: any 
}

export const expr_type = (expr: LainElement) => expr.type
export const expr_value = (expr: LainElement) => expr.value

export const make_element = (type: LainType, value: any) => {
    return {
        type: type,
        value: value
    }
}


export const is_lain_element = define_generic_predicate("is_lain_element", (x: any) => {
    return x != undefined && x != null && x.type != undefined && x.value != undefined
})

export const is_element_string = define_generic_predicate("is_l_string", (x: any) => {
    return is_lain_element(x) && x.type === LainType.string
})

export const lain_string = (value: string) => make_element(LainType.string, value)

export const is_element_number = define_generic_predicate("is_l_number", (x: any) => {
    return is_lain_element(x) && x.type === LainType.number
})

export const lain_number = (value: number) => make_element(LainType.number, value) 

export const is_element_boolean = define_generic_predicate("is_l_boolean", (x: any) => {
    return is_lain_element(x) && x.type === LainType.boolean
})

export const lain_boolean = (value: boolean) => make_element(LainType.boolean, value)

export const is_element_symbol = define_generic_predicate("is_l_symbol", (x: any) => {
    return is_lain_element(x) && x.type === LainType.symbol
})

export const lain_symbol = (value: string) => make_element(LainType.symbol, value)

export const is_element_quoted = define_generic_predicate("is_l_quoted", (x: any) => {
    return is_lain_element(x) && x.type === LainType.quoted
})

export const lain_quoted = (value: LainElement) => make_element(LainType.quoted, value)

export const is_element_expression = define_generic_predicate("is_l_expression", (x: any) => {
    return is_lain_element(x) && x.type === LainType.expression
})

export const lain_expression = (value: LainElement[]) => make_element(LainType.expression, value)

export const is_self_evaluating = define_generic_predicate("is_self_evaluating", (x: any) => {
    return is_element_string(x) || is_element_number(x) || is_element_boolean(x)
})

export const normalize_expr = (expr: LainElement) => expr.value


export const source_constant = (value: any) => {
    const id = uuidv4()

    return source_cell("constant | " + to_string(value), value)
}

export const constant_cell_from_expr = compose(expr_value, source_constant)


export const construct_cell_from_expr = compose(expr_value, construct_cell)

export const make_output = (expr: LainElement) => {
    return [make_element(LainType.symbol, "->"), expr]
}
