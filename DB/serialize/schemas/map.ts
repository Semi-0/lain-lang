// ============================================================================
// MAP SCHEMA ENCODING
// ============================================================================

import { is_cell } from "ppropogator/Cell/Cell";
import { encode_cell_reference } from "./references";
import { register_predicate } from "generic-handler/Predicates";

type EncodeFn = (x: any) => any;

export const is_map_schema = register_predicate("is_map_schema", (a: any) => a && a.type === "MAP");

export const map_schema = (map: Map<string, any>, encode: EncodeFn): Record<string, any> => {
    const record: Record<string, any> = { type: "MAP" };
    map.forEach((value, key) => {
        if (is_cell(value)) {
            record[key] = encode_cell_reference(value);
        } else {
            record[key] = encode(value);
        }
    });
    return record;
};

export const map_schema_decode = (schema: Record<string, any>, decode: (x: any, db: any) => any, db: any): Map<string, any> => {
    return new Map(Object.entries(schema).filter(([key, value]) => key !== "type").map(([key, value]) => {
        return [key, decode(value, db)];
    }));
}
