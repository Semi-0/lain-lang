// ============================================================================
// CORE DECODING PROCEDURE
// ============================================================================
import { construct_simple_generic_procedure, define_generic_procedure_handler, trace_generic_procedure } from "generic-handler/GenericProcedure";
import { throw_error } from "generic-handler/built_in_generics/other_generic_helper";
import { is_self_evaluating } from "./helper";
import { to_string } from "generic-handler/built_in_generics/generic_conversation";
import type { IGunInstance } from "gun";
import { plain_value_schema_decode } from "./schemas/plain_value_schema";
import { is_cell_schema, lazied_cell_schema_decode } from "./schemas/cell";
import { match_args, register_predicate } from "generic-handler/Predicates";
import { is_any, is_string } from "generic-handler/built_in_generics/generic_predicates";
import { is_closure_schema } from "./schemas/closure_schema";
import { closure_schema_decode } from "./schemas/closure_schema";
import { is_map_schema, map_schema_decode } from "./schemas/map";
import { is_set_schema, set_schema_decode } from "./schemas/set";
import { is_layered_object_schema, layered_object_schema_decode } from "./schemas/layered_object";
import { lain_element_schema_decode } from "./schemas/lain_element";
import { is_lain_element_schema } from "./predicates";
import { interested_neighbor_schema_decode, is_interested_neighbor_schema } from "./schemas/neighbor";
import { decode_propagator_reference, is_cell_reference_schema, is_propagator_reference_schema, is_reference_schema, lazied_decode_cell_reference } from './schemas/references';
import { the_nothing } from 'ppropogator';
import { is_primitive_schema, primitive_schema_decode } from './schemas/primitive';

export const gun_db_schema_decode = construct_simple_generic_procedure(
    "deserialize",
    2,
   (x: any, db: IGunInstance) => {
    if (x && typeof x === 'object' && x.value !== undefined && is_self_evaluating(x.value)) {
        return plain_value_schema_decode(x);
    } else {
        if (is_self_evaluating(x)) {
            return x;
        }
        console.log(`[decode] No handler matched for type: ${typeof x}`, x);
        return the_nothing;
    }
   }
);


const is_json_string = register_predicate("is_json_string", (a: any) => {
    if (typeof a !== "string") return false;
    const s = a.trim();
    return s.startsWith("{") && s.endsWith("}");
});

define_generic_procedure_handler(
    gun_db_schema_decode,
    match_args(is_json_string, is_any),
    (string: any, db: IGunInstance) => {
        try {
            const decoded = JSON.parse(string);
            return gun_db_schema_decode(decoded, db);
        } 
        catch (error) {
            console.error("error decoding json string", error);
            console.dir(string, { depth: 20 });
            return the_nothing;
        }
    }
)

define_generic_procedure_handler(
    gun_db_schema_decode,
    match_args(is_cell_schema, is_any),
    (cell: any, db: IGunInstance) => {
        return lazied_cell_schema_decode()(cell, gun_db_schema_decode, db);
    }
);


define_generic_procedure_handler(
    gun_db_schema_decode,
    match_args(is_map_schema, is_any),
    (map: any, db: IGunInstance) => {
        const decoded = map_schema_decode(map, gun_db_schema_decode, db);
        return decoded;

    }
)

define_generic_procedure_handler(
    gun_db_schema_decode,
    match_args(is_set_schema, is_any),
    (set: any, db: IGunInstance) => {
        return set_schema_decode(set, gun_db_schema_decode, db);
    }
);

define_generic_procedure_handler(
    gun_db_schema_decode,
    match_args(is_layered_object_schema, is_any),
    (object: any, db: IGunInstance) => {
        const decoded = layered_object_schema_decode(db, object, gun_db_schema_decode);
        console.log("decoded layered object", to_string(decoded));
        return decoded;

    }
);

define_generic_procedure_handler(
    gun_db_schema_decode,
    match_args(is_lain_element_schema, is_any),
    (element: any, db: IGunInstance) => {
        return lain_element_schema_decode(element, gun_db_schema_decode, db);
    }
);

define_generic_procedure_handler(
    gun_db_schema_decode,
    match_args(is_closure_schema, is_any),
    (closure: any, db: IGunInstance) => {
        return closure_schema_decode(closure, gun_db_schema_decode, db);
    }
);

define_generic_procedure_handler(
    gun_db_schema_decode,
    match_args(is_primitive_schema, is_any),
    (primitive: any, db: IGunInstance) => {
        return primitive_schema_decode(primitive)
    }
);


define_generic_procedure_handler(
    gun_db_schema_decode,
    match_args(is_interested_neighbor_schema, is_any),
    (neighbor: any, db: IGunInstance) => {
        return interested_neighbor_schema_decode(db, neighbor, gun_db_schema_decode)
    }
)

define_generic_procedure_handler(
    gun_db_schema_decode,
    match_args(is_cell_reference_schema, is_any),
    (reference: any, db: IGunInstance) => {
        return lazied_decode_cell_reference()(reference, db)
    }
)

define_generic_procedure_handler(
    gun_db_schema_decode,
    match_args(is_propagator_reference_schema, is_any),
    (reference: any, db: IGunInstance) => {
        return decode_propagator_reference(reference, db)
    }
)
