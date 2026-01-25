// ============================================================================
// CORE ENCODING PROCEDURE
// ============================================================================
import { construct_simple_generic_procedure, define_generic_procedure_handler } from "generic-handler/GenericProcedure";
import { match_args } from "generic-handler/Predicates";
import { throw_error } from "generic-handler/built_in_generics/other_generic_helper";
import { is_cell } from "ppropogator/Cell/Cell";
import { is_layered_object } from "sando-layer/Basic/LayeredObject";
import { is_map } from "ppropogator/Helper/Helper";
import { is_boolean, is_number, is_string } from "generic-handler/built_in_generics/generic_predicates";
import { is_contradiction, is_nothing } from "ppropogator";
import { to_string } from "generic-handler/built_in_generics/generic_conversation";
import { is_better_set } from "generic-handler/built_in_generics/generic_better_set";
import { cell_schema_encode } from "./schemas/cell";
import { map_schema } from "./schemas/map";
import { set_schema_encode } from "./schemas/set";
import { layered_object_schema } from "./schemas/layered_object";
import { lain_element_schema } from "./schemas/lain_element";
import { closure_schema } from "./schemas/closure_schema";
import { is_self_evaluating } from "./helper";
import { is_element_symbol, is_lain_element } from "../../compiler/lain_element";
import { _is_closure, is_primitive } from "../../compiler/closure";
import { plain_value_schema_encode } from "./schemas/plain_value_schema";
import { interested_neighbor_schema, is_neighbor } from "./schemas/neighbor";
import { primitive_schema } from "./schemas/primitive";

export const gun_db_schema_encode = construct_simple_generic_procedure(
    "serialize",
    1,
    (x: any) => {
        if (is_self_evaluating(x)) {
           if (is_string(x)) {
            return plain_value_schema_encode(x);
           }
           else if (is_number(x)) {
            return plain_value_schema_encode(x);
           }
           else if (is_element_symbol(x)) {
            return plain_value_schema_encode(x);
           }
           else if (is_boolean(x)) {
            return plain_value_schema_encode(x);
           }
           else if (is_nothing(x)) {
            return plain_value_schema_encode(x);
           }
           else if (is_contradiction(x)) {
            return plain_value_schema_encode(x);
           }
           else{
                console.error("serialize", "serialize", "Not implemented: " + to_string(x));
           }
        } 
        else if (typeof x === 'object' && x !== null) {
            // Fallback for plain objects that don't match other schemas
            return plain_value_schema_encode(x);
        }
        else {
            throw_error("serialize", "serialize", "Not implemented: " + to_string(x));
        }
    }
);

// Register handlers for different types
// Note: Handlers receive the encode function as context to avoid circular dependencies
define_generic_procedure_handler(
    gun_db_schema_encode,
    match_args(is_cell),
    (cell: any) => cell_schema_encode(cell, gun_db_schema_encode)
);

define_generic_procedure_handler(
    gun_db_schema_encode,
    match_args(is_map),
    (map: any) => map_schema(map, gun_db_schema_encode)
);

define_generic_procedure_handler(
    gun_db_schema_encode,
    match_args(is_better_set),
    (set: any) => set_schema_encode(set, gun_db_schema_encode)
);



define_generic_procedure_handler(
    gun_db_schema_encode,
    match_args(is_layered_object),
    (object: any) => {
        const encoded = JSON.stringify(layered_object_schema(object, gun_db_schema_encode));
        console.log("encoded layered object", encoded);
        return encoded;
    }
);

define_generic_procedure_handler(
    gun_db_schema_encode,
    match_args(is_lain_element),
    (element: any) => lain_element_schema(element, gun_db_schema_encode)
);

define_generic_procedure_handler(
    gun_db_schema_encode,
    match_args(_is_closure),
    (closure: any) => JSON.stringify(closure_schema(closure, gun_db_schema_encode))
);

define_generic_procedure_handler(
    gun_db_schema_encode,
    match_args(is_primitive),
    (primitive: any) => primitive_schema(primitive)
);

define_generic_procedure_handler(
    gun_db_schema_encode,
    match_args(is_neighbor),
    (neighbor: any) => JSON.stringify(interested_neighbor_schema(neighbor))
);

// define_generic_procedure_handler(
//     gun_db_schema_encode,
//     match_args(is_propagator),
//     (propagator: any) => propagator_(propagator, gun_db_schema_encode)
// );
