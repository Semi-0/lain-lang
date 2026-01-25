// ============================================================================
// SET SCHEMA ENCODING
// ============================================================================

import { for_each } from "generic-handler/built_in_generics/generic_collection";
import { BetterSet, construct_better_set, identify_by } from "generic-handler/built_in_generics/generic_better_set";

import { register_predicate } from "generic-handler/Predicates";

type EncodeFn = (x: any) => any;

export const is_set_schema = register_predicate("is_set_schema", (a: any) => a && a.type === "set");

export const set_schema_encode = (set: BetterSet<any>, encode: EncodeFn): Record<string, any> => {
    const record: Record<string, any> = { type: "set" };
    for_each(set, (value) => {
        record[identify_by(value)] = encode(value);
    });
    return record;
};


export const set_schema_decode = (schema: Record<string, any>, decode: (x: any, db: any) => any, db: any): BetterSet<any> => {
    return construct_better_set(Object.entries(schema).filter(([key, value]) => key !== "type").map(([key, value]) => {
        return decode(value, db);
    }));
}
