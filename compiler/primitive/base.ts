import { function_to_primitive_propagator, register_predicate } from "ppropogator";
// Type imports separated to avoid Vite export issues
import type { Cell } from "ppropogator/Cell/Cell";
import type { Propagator } from "ppropogator/Propagator/Propagator";
import { make_ce_arithmetical } from "ppropogator/Propagator/Sugar";
import { source_constant } from "../lain_element";

export type Primitive = {
    name: string,
    inputs_count: number,
    output_count: number,
    constructor: (...args: Cell<any>[]) => Propagator
}


export const is_primitive = register_predicate("is_primitive", (x: any) => {
    return x != undefined && x != null && x.name != undefined && x.inputs_count != undefined && x.output_count != undefined && x.constructor != undefined
})

export const p_is_primitive = function_to_primitive_propagator("is_primitive", is_primitive)

export const ce_is_primitive = make_ce_arithmetical(p_is_primitive, "is_primitive") as (constructor: Cell<any>) => Cell<boolean>

export const make_primitive = (name: string, inputs_count: number, output_count: number, constructor: (...args: Cell<any>[]) => Propagator) => {
    return source_constant({
        name: name,
        inputs_count: inputs_count,
        output_count: output_count,
        constructor: constructor
    }) as Cell<Primitive>
} 

export const make_two_arity_primitive = (name: string, constructor: (a: Cell<any>, b: Cell<any>) => Propagator) => {
    return make_primitive(name, 2, 1, constructor)
}

