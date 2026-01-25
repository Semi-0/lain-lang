// ============================================================================
// REFERENCE CREATION FUNCTIONS
// ============================================================================

import type { Cell } from "ppropogator/Cell/Cell";
import { cell_id, cell_name, construct_cell, NeighborType } from "ppropogator/Cell/Cell";
import { construct_propagator, Propagator, propagator_id, propagator_inputs, propagator_name, propagator_outputs } from "ppropogator/Propagator/Propagator";
import type { Reference } from "../types";
import { IGunInstance } from "gun";
import { gun_cell_receiver, local_has_neighbor } from "../gun_cell";
import { cell_snapshot, propagator_from_diagram, propagator_snapshot } from "ppropogator/Shared/PublicState";
import { get_id } from "ppropogator/Shared/Generics";
import { register_predicate } from "generic-handler/Predicates";

export const make_reference = (ref_type: string, id: string, name: string): Reference => ({
    type: "reference",
    ref_type,
    id,
    name,
});

export const is_reference_schema = register_predicate("is_reference_schema", (a: any) => a && a.type === "reference");

export const encode_cell_reference = (cell: Cell<any>): Reference => make_reference("cell", cell_id(cell), cell_name(cell));



export const is_cell_reference_schema = register_predicate("is_cell_reference_schema", (a: any) => a && a.type === "reference" && a.ref_type === "cell");


// but what if that is a gun cell?
export const lazied_decode_cell_reference = () => (reference: Reference, db: IGunInstance): Cell<any> => {
    // const receiver = require("./gun_cell").gun_cell_receiver;
    // return receiver(db, reference.id)
    const cell = cell_snapshot().find((c) => cell_id(c) === reference.id);
    if (cell != undefined) {
        // 0.1 local has it
        return cell
    }
    else {
        // it not assume that is a gun cell?
        return gun_cell_receiver(db, reference.name, reference.id)
    }   
    // we shouldn't check whether gun have it or not
    // but also there is not way to know if this is a normal cell that didn't got sync
}

export const local_has_propagator = (propagator: Propagator) => {
    return propagator_snapshot().some(p => p.getRelation().get_id() === propagator_id(propagator));
}

export const unknown_propagator = (id: string) => construct_propagator(
    [],
    [],
    () => {},
    "unknown_propagator",
    id,
    []
)


export type PropagatorReference = {
    type: "propagator";
    id: string;
    name: string;
    inputs: Reference[],
    outputs: Reference[]
}

export const is_propagator_reference_schema = register_predicate(
    "is_propagator_reference_schema", 
    (a: any) => a && 
    a.type === "propagator" && 
    a.id != undefined &&
    a.name != undefined &&
    a.inputs != undefined && 
    a.outputs != undefined 
)

export const make_propagator_reference = (propagator: Propagator): PropagatorReference => ({
    type: "propagator",
    id: propagator_id(propagator),
    name: propagator_name(propagator),
    inputs: propagator_inputs(propagator).map(encode_cell_reference),
    outputs: propagator_outputs(propagator).map(encode_cell_reference),
})


export const encode_propagator_reference = (propagator: Propagator): PropagatorReference => 
    make_propagator_reference(propagator);

export const decode_propagator_reference = (propagator_ref: PropagatorReference, db: IGunInstance): Propagator => {
    const decode_cell_reference =  (referece: Reference) => lazied_decode_cell_reference()(referece, db);
    if (is_propagator_reference_schema(propagator_ref)) {
        const existed_propagator = propagator_snapshot().find(p => p.getRelation().get_id() === propagator_ref.id);
        if (existed_propagator) {
            return existed_propagator;
        }
        else {
            return construct_propagator(
                propagator_ref.inputs.map(decode_cell_reference),
                propagator_ref.outputs.map(decode_cell_reference),
                () => {},
                propagator_ref.name,
                propagator_ref.id,
                [NeighborType.remote]
            )
        }

    }
    else{
        throw new Error("Invalid propagator reference");
    }
};

