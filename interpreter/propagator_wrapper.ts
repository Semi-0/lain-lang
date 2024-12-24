import { generic_wrapper } from "generic-handler/built_in_generics/generic_wrapper";
import { construct_compound_propagator } from "../network/propagator";
import type { LayeredObject } from "sando-layer/Basic/LayeredObject";
import { andCompose, andExecute } from "generic-handler/built_in_generics/generic_combinator"
import { is_scheme_cell } from "../shared/type_predicates";
import { get_value } from "../shared/type_layer";
import { make_layered_procedure } from "sando-layer/Basic/LayeredProcedure";
import { update } from "../network/cell";

export const get_cell = andExecute(is_scheme_cell, get_value)

export const wrapped_construct_compound_propagator = generic_wrapper(construct_compound_propagator,
    (o) => o,
    (os: LayeredObject[]) => os.map(get_cell),
    (os: LayeredObject[]) => os.map(get_cell),
    (a) => a
)


export const tell_cell = make_layered_procedure("tell_cell", 2, update)