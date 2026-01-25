// ============================================================================
// PROPAGATOR SCHEMA ENCODING
// ============================================================================

import { propagator_id, propagator_inputs, propagator_outputs, propagator_name } from "ppropogator/Propagator/Propagator";
import { Propagator } from "ppropogator/Propagator/Propagator";
import { PropagatorSchema } from "../types";
import { encode_cell_reference } from "./references";
import { Cell } from "ppropogator";
import { register_predicate } from "generic-handler/Predicates";


// TODO: DECODE & ENCODE PARENT CHILD RELATIONSHIP!!!

export const is_propagator_schema = register_predicate("is_propagator_schema", (a: any) => a && a.type === "propagator");

export const propagator_schema = (propagator: Propagator): PropagatorSchema => ({
    type: "propagator",
    id: propagator_id(propagator),
    name: propagator_name(propagator),
    inputs: propagator_inputs(propagator).map(encode_cell_reference),
    outputs: propagator_outputs(propagator).map(encode_cell_reference),
});

interface PropagatorSnapshot {
    id: string;
    name: string;
    inputs: Cell<any>[];
    outputs: Cell<any>[];
}

export const propagator_schema_decode = (schema: PropagatorSchema, decode: (x: any) => any): PropagatorSnapshot => {
    return {
        id: schema.id,
        name: schema.name,
        inputs: schema.inputs.map(decode),
        outputs: schema.outputs.map(decode),
    }
}