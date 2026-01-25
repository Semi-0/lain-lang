// ============================================================================
// PRIMITIVE SCHEMA ENCODING
// ============================================================================

import { register_predicate } from "generic-handler/Predicates";
import type { Primitive } from "../../../compiler/closure";
import { 
    p_add, p_subtract, p_multiply, p_divide, 
    p_greater_than, p_less_than, p_equal, p_not 
} from "ppropogator";
import { p_greater_than_or_equal, p_less_than_or_equal, bi_sync } from "ppropogator/Propagator/BuiltInProps";
import { p_socket_client, p_socket_server } from "../../../compiler/closure";

export const is_primitive_schema = register_predicate("is_primitive_schema", (a: any) => a && a.type === "primitive");

export const primitive_schema = (primitive: Primitive): Record<string, any> => ({
    type: "primitive",
    name: primitive.name,
    inputs_count: primitive.inputs_count,
    output_count: primitive.output_count,
});

// Registry of primitive constructors
const primitive_registry: Record<string, any> = {
    "+": p_add,
    "-": p_subtract,
    "*": p_multiply,
    "/": p_divide,
    ">": p_greater_than,
    "<": p_less_than,
    ">=": p_greater_than_or_equal,
    "<=": p_less_than_or_equal,
    "==": p_equal,
    "not": p_not,
    "bi_sync": bi_sync,
    "socket-client": p_socket_client,
    "socket-server": p_socket_server,
};

export const primitive_schema_decode = (schema: Record<string, any>): Primitive => {
    const constructor = primitive_registry[schema.name];
    if (!constructor) {
        throw new Error(`Unknown primitive: ${schema.name}`);
    }
    return {
        name: schema.name,
        inputs_count: schema.inputs_count,
        output_count: schema.output_count,
        constructor: constructor,
    };
}








