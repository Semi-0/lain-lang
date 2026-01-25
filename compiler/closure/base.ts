import { type LexicalEnvironment } from "../env";
import { expr_value, lain_string, lain_symbol, source_constant, type LainElement } from "../lain_element";
import { parseExpr } from "../parser";
import { parse, State } from "parse-combinator";
import { generic_wrapper } from "generic-handler/built_in_generics/generic_wrapper";
import { curried_map } from "ppropogator/Helper/Helper";
import { calculate_closure_hash } from "./hash";
export { calculate_closure_hash };

export type ClosureTemplate = {
    env: LexicalEnvironment
    name: LainElement,
    inputs:  LainElement[],
    outputs: LainElement[],
    body: LainElement[],
}

export const construct_closure = (env: LexicalEnvironment, name: LainElement, inputs: LainElement[], outputs: LainElement[], body: LainElement[]): ClosureTemplate => {
    return {
        env: env,
        name: name,
        inputs: inputs,
        outputs: outputs,
        body: body,
    }
}


export const closure_inputs_cells = (closure: ClosureTemplate, exprs: LainElement[], compile: (exprs: LainElement) => any) => {
    return exprs.slice(0, closure.inputs.length).map(compile)
}

export const closure_outputs_cells = (closure: ClosureTemplate, exprs: LainElement[], compile: (exprs: LainElement) => any) => {
    return exprs.slice(closure.inputs.length).map(compile)
}

export const construct_closure_raw: (env: LexicalEnvironment, name: string, inputs: string[], outputs: string[], body: string) => ClosureTemplate = generic_wrapper(
    construct_closure,
    // output
    (c) => c,
    // environment
    (e) => e,
    // name
    lain_string,
    // inputs
    curried_map(lain_symbol),
    // outputs
    curried_map(lain_symbol),
    // body
    (string: string) => {
        const parsed = parse(parseExpr, new State(string))
        if (parsed.success) {
            return parsed.value
        }
        else {
            console.error("closure conversation failed")
            console.error(string)
            return []
        }
    }
)

export const construct_closure_cell = (env: LexicalEnvironment, name: LainElement, inputs: LainElement[], outputs: LainElement[], body: LainElement[]) => {
    return source_constant(construct_closure(env, name, inputs, outputs, body))
}

