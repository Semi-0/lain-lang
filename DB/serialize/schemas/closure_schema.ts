// ============================================================================
// CLOSURE SCHEMA ENCODING
// ============================================================================

import type { ClosureTemplate } from "../../../compiler/closure/base";
import type { Reference } from "../types";
import { is_cell } from "ppropogator/Cell/Cell";
import { encode_cell_reference } from "./references";

import { type ClosureSchema, type LainElementSchema } from "../types";
type EncodeFn = (x: any) => any;
import { lain_element_schema } from "./lain_element";
import { register_predicate } from "generic-handler/Predicates";
import type { LainElement } from "../../../compiler/lain_element";

export const is_closure_schema = register_predicate("is_closure_schema", (a: any) => a && a.type === "closure");

export const closure_schema = (closure: ClosureTemplate, encode: EncodeFn): ClosureSchema => {
    // Encode env as cell reference since LexicalEnvironment = Cell<Map<string, Cell<any>>>
    const envRef = is_cell(closure.env) 
        ? encode_cell_reference(closure.env)
        : encode(closure.env); // fallback if not a cell
    

    const body_encoded = (body: LainElement[]) => {
        const encoded = body[0].map(body => lain_element_schema(body, encode));
        console.log("*****body", body);
        console.log("*****encoded", encoded);
        return JSON.stringify(encoded);
    }

    return {
        type: "closure",
        env: envRef as Reference,
        name: lain_element_schema(closure.name, encode),
        inputs: closure.inputs.map(input => lain_element_schema(input, encode)),
        outputs: closure.outputs.map(output => lain_element_schema(output, encode)),
        body: body_encoded(closure.body),
    };
};


export const closure_schema_decode = (schema: ClosureSchema, decode: (x: any, db: any) => any, db: any): ClosureTemplate => {
   
   const body_decoded = (body: string) => {
    const parsed = JSON.parse(body);
    console.log("*********parsed", parsed);
    return [parsed.map(body => decode(body, db))];
   }
    return {
        env: decode(schema.env, db),
        name: decode(schema.name, db),
        inputs: schema.inputs.map(input => decode(input, db)),
        outputs: schema.outputs.map(output => decode(output, db)),
        body: body_decoded(schema.body),
    };
}
