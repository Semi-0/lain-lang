import { 
    type Cell, cell_id, cell_strongest, cell_strongest_base_value, 
    compound_propagator, construct_cell, construct_propagator,
    inspect_strongest, 
} from "ppropogator";
import { zip } from "effect/Array";
import { type LexicalEnvironment, parent_key } from "../env";
import { expr_value, type LainElement } from "../lain_element";
import { ce_dict } from "ppropogator/DataTypes/CarriedCell";
import { compile } from "../compiler";
import { incremental_compile } from "../incremental_compiler";
import { any_unusable_values } from "ppropogator/Cell/CellValue";
import { get_vector_clock_layer } from "ppropogator/AdvanceReactivity/vector_clock";
import { closure_inputs_cells, closure_outputs_cells, type ClosureTemplate } from "./base";
import { internal_unfold_closure, type UnfoldedClosure, type InternalUnfoldedClosure, p_apply_closure_template, ce_apply_closure } from "./unfold";
import { make_layered_procedure } from "sando-layer/Basic/LayeredProcedure";
import { ce_pass_dependences, p_combine_dependences_with_value_from_right, p_pass_dependences } from "ppropogator/Propagator/BuiltInProps";
import { make_output } from "../lain_element";
import { trace_func } from "ppropogator/helper";
import { is_cell } from "ppropogator/Cell/Cell";


export const compile_cells = (expr: any, env: LexicalEnvironment, compile: (expr: LainElement, env: LexicalEnvironment) => Cell<any>) => {

        const cell = compile(expr, env)

        if (is_cell(cell)) {
            return cell
        }
        else {
            console.error("compiled cell is not a cell", cell)
            console.error("expr", expr)
            console.error("env", env)
            console.error("compile", compile)
            return construct_cell("compiled_cell")
        }
}


export const incremental_apply_closure = (
    closure: Cell<ClosureTemplate>,
    operands_expr: LainElement[], 
    env: LexicalEnvironment, 
    compile: (expr: LainElement[] | LainElement, env: LexicalEnvironment) => any
) => {
    return compound_propagator(
    [closure, env],
    [env],
    () => {
        if (any_unusable_values([cell_strongest(closure), cell_strongest(env)])) {
            return;
        }
       
        const closure_base = cell_strongest_base_value(closure) as ClosureTemplate
        const outputs_cell = closure_outputs_cells(closure_base, operands_expr, (expr: LainElement) => compile_cells(make_output(expr), env, compile))
 

   
        // })
        const inputs_cell = closure_inputs_cells(closure_base, operands_expr, (expr: LainElement) => compile_cells(expr, env, compile))
        // console.log("inputs cell", inputs_cell)

        const scoped_inputs_cell = inputs_cell.map((i: Cell<any>) => {
            const scoped_input = construct_cell("scoped_input")
            p_combine_dependences_with_value_from_right([closure, i], scoped_input)
            return scoped_input
        })

        const unfolded_closure = ce_apply_closure(
            compile,
            outputs_cell,
            scoped_inputs_cell,
            env,
            closure
        )        
        },
        "apply_closure_incremental"
    )
}

export const apply_closure = (closure: Cell<ClosureTemplate>, operands_expr: LainElement[], env: LexicalEnvironment) => compound_propagator(
    [closure],
    [env],
    () => {
        const closure_value = cell_strongest_base_value(closure) as ClosureTemplate
        const name = closure_value.name
        const inputs_vars = closure_value.inputs.map(expr_value)
        const outputs_vars = closure_value.outputs.map(expr_value)
        
        const external_inputs = operands_expr.slice(0, inputs_vars.length).map(
            (operand: LainElement) => compile(operand)(env)
        )
        const external_outputs = operands_expr.slice(inputs_vars.length).map(
            (operand: LainElement) => compile(make_output(operand))(env)
        )

        const parent_env = closure_value.env
        const vars = zip([...inputs_vars, ...outputs_vars], [...external_inputs, ...external_outputs])

        const sub_env = ce_dict(new Map([[parent_key, parent_env], ...vars]))

        compound_propagator(
            [...external_inputs, sub_env],
            external_outputs,
            () => {
                closure_value.body.forEach((body: LainElement) => {
                    compile(body)(sub_env)
                });
            },
            expr_value(name)
        )
    },
    "apply_closure"
)

