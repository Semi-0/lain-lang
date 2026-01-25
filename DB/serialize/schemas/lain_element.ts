// ============================================================================
// LAIN ELEMENT SCHEMA ENCODING
// ============================================================================

import { register_predicate } from "generic-handler/Predicates";
import { LainType, expr_type, expr_value } from "../../../compiler/lain_element";
import type { LainElement } from "../../../compiler/lain_element";
import type { LainElementSchema } from "../types";
type EncodeFn = (x: any) => any;

export const is_lain_element_schema = register_predicate("is_lain_element_schema", (a: any) => a && a.type === "lain_element");

export const lain_element_schema = (element: LainElement, encode: EncodeFn): LainElementSchema => ({
    type: "lain_element",
    element_type: expr_type(element),
    value: encode(expr_value(element)),
});

export const lain_element_schema_decode = (schema: LainElementSchema, decode: (x: any, db: any) => any, db: any): LainElement => {
    return {
        type: schema.element_type as LainType,
        value: decode(schema.value, db),
    };
}
