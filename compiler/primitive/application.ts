import { 
    type Cell, cell_strongest_base_value, compound_propagator, 
    type Propagator, construct_propagator, cell_strongest, 

} from "ppropogator";
import { type LexicalEnvironment } from "../env";
import { make_output, type LainElement } from "../lain_element";
import { incremental_compile } from "../incremental_compiler";
import { compile } from "../compiler";
import { any_unusable_values } from "ppropogator/Cell/CellValue";
import { make_layered_procedure } from "sando-layer/Basic/LayeredProcedure";
import { type Primitive } from "./base";
import { compose } from "generic-handler/built_in_generics/generic_combinator";

export const incremental_apply_primitive = (primitive: Cell<Primitive>, operands_expr: LainElement[], env: LexicalEnvironment, compile: (expr: LainElement[] | LainElement, env: LexicalEnvironment) => any) => compound_propagator(
    [env, primitive],
    [],
    () => {
        const primitive_value = cell_strongest_base_value(primitive) as Primitive
        const inputs_count = primitive_value.inputs_count

        const inputs = operands_expr.slice(0, inputs_count).map((expr: LainElement) => compile(expr, env))
        const outputs = operands_expr.slice(inputs_count).map(compose(make_output, (expr: LainElement) => compile(expr, env))) as Cell<any>[]

        // console.log("prim built")
        const args = [...inputs, ...outputs]
        // @ts-ignore
        primitive_value.constructor(...args)
    },
    "apply_primitive"
)

export const apply_primitive = (primitive: Cell<Primitive>, operands_expr: LainElement[], env: LexicalEnvironment) => compound_propagator(
    [primitive],
    [],
    () => {
        const primitive_value = cell_strongest_base_value(primitive) as Primitive
        const inputs_count = primitive_value.inputs_count

        const inputs = operands_expr.slice(0, inputs_count).map(
            (operand: LainElement) => compile(operand)(env)
        )
        const outputs = operands_expr.slice(inputs_count).map(
            (operand: LainElement) => {
                return compile(make_output(operand))(env)
            }
        )

        return compound_propagator(
            inputs,
            outputs,
            () => {
                console.log("prim built")
                const prim = cell_strongest_base_value(primitive)
                const args = [...inputs, ...outputs]
                // @ts-ignore
                prim.constructor(...args)
            },
            "apply_primitive"
        )
    },
    "apply_primitive"
)

export const l_apply = make_layered_procedure("l_apply", 2, (procedure: (...args: any[]) => any, inputs: any[]) => {
    return procedure(...inputs)
})

export const f_apply_primitive = (constructor: Cell<Primitive>, args: Cell<any[]>, output: Cell<Propagator>) => 
    function_to_primitive_propagator("apply_primitive", (primitive: Primitive, args: any[]) => {
        return primitive.constructor(...args)
    })(constructor, args, output)

import { function_to_primitive_propagator } from "ppropogator";

export const p_dynamic_primitive_propagator = (name: string, func: Cell<(...inputs: any[]) => any>) => 
    (...args: Cell<any>[]) => {
        const inputs = [...args.slice(0, -1), func]
        const output = args[args.length - 1]

        return construct_propagator(
            inputs,
            output ? [output] : [],
            () => {
                const is = inputs.map(cell_strongest)
                if (any_unusable_values(is)) {
                    return
                }
                else {
                    const f = cell_strongest(func)
                    const result = l_apply(f, is)
                    output.update(result)
                }
            },
            name
        )
    }

