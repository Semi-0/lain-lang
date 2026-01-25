// ============================================================================
// INTERESTED NEIGHBOR SCHEMA ENCODING
// ============================================================================

import type { interesetedNeighbor as Neighbor } from "ppropogator/Cell/Cell";
import { decode_propagator_reference, encode_propagator_reference } from "./references";
import { register_predicate } from "generic-handler/Predicates";
import { is_interested_neighbor as _is_interested_neighbor_predicate } from "ppropogator/Cell/Cell";
import type { IGunInstance } from "gun";

export const is_neighbor = register_predicate(
    "is_neighbor",
    (n: any) => n && n.type != undefined && n.propagator != undefined
)

export const is_interested_neighbor_schema = register_predicate("is_interested_neighbor_schema", (a: any) => a && a.type === "interested_neighbor");

export const interested_neighbor_schema = (neighbor: Neighbor): Record<string, any> => ({
    type: "interested_neighbor",
    propagator: encode_propagator_reference(neighbor.propagator),
    neighbor_type: neighbor.type,
});

export const interested_neighbor_schema_decode = ( db: IGunInstance, schema: Record<string, any>, decode: (x: any, db: any) => any): Neighbor => {
    return {
        propagator: decode_propagator_reference(schema.propagator, db),
        type: schema.neighbor_type,
    };
}
