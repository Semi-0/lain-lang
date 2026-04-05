import { Cell, cell_strongest_base_value, compound_propagator, construct_cell } from "ppropogator"
import { closure_inputs_cells, ClosureTemplate } from "./base"
import { expr_value, LainElement } from "../lain_element"
import { extend_env, LexicalEnvironment } from "../env"
import { is_apply_closure_template } from "./unfold"
import { zip } from "effect/Array"



export const apply_closure_symlink = (
    closure: Cell<ClosureTemplate>,
    inputs: Cell<any>[],
    outputs: Cell<any>[],
    parent_env: LexicalEnvironment,
    compile: (expr: LainElement, env: LexicalEnvironment) => any
) => compound_propagator(
    [closure, ...inputs],
    outputs,
    () => {
        const closure_value = cell_strongest_base_value(closure) as ClosureTemplate

        if (is_apply_closure_template(closure_value)) {
            const inputs_vars = closure_value.inputs.map(expr_value)
            const outputs_vars = closure_value.outputs.map(expr_value)

            const scoped_inputs = inputs_vars.map((input_var: string) => construct_cell(input_var))

            const env = extend_env(parent_env, [
                ...zip(inputs_vars, scoped_inputs),
                ...zip(outputs_vars, outputs)
            ])
        }
      
    },
    "apply_closure_symlink"
)