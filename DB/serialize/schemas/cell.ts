// ============================================================================
// CELL SCHEMA ENCODING
// ============================================================================

import type { Cell } from "ppropogator/Cell/Cell";
import { cell_content, cell_id, cell_name, cell_neightbor_set, cell_strongest, primitive_construct_cell } from "ppropogator/Cell/Cell";
import { register_predicate } from "generic-handler/Predicates";
// Type for the encode function to avoid circular dependency
type EncodeFn = (x: any) => any;
import type { CellSchema } from "../types";
import { IGunInstance } from "gun";

export const is_cell_schema = register_predicate("is_cell_schema", (a: any) => a && a.type === "cell");

// maybe cell schema should be gun receiver?
export const cell_schema_encode = (cell: Cell<any>, encode: EncodeFn): CellSchema => ({
    type: "cell",
    id: cell_id(cell),
    name: cell_name(cell),
    content: encode(cell_content(cell)),
    strongest: encode(cell_strongest(cell)),
    neighbors: encode(cell_neightbor_set(cell)),
});

// should we store all content?
// or maybe just the strongest value?
// but then we lost the cross machine inspectability


// TODO: DECODE PARENT CHILD RELATIONSHIP!!!
export const lazied_cell_schema_decode = () => (schema: CellSchema, decode: (x: any) => any, db: IGunInstance): Cell<any> => { 
    const receiver = require("../gun_cell").gun_cell_receiver
    return receiver(db, schema.name, schema.id);
}