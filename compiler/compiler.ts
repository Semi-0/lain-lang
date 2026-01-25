import { match } from "pmatcher/MatchBuilder"
import { construct_simple_generic_procedure, trace_generic_procedure } from "generic-handler/GenericProcedure"
import { isSucceed } from "pmatcher/Predicates"
import { P } from "pmatcher/MatchBuilder"
import { ce_switch } from "ppropogator/Propagator/BuiltInProps"
import { constant_cell_from_expr,  is_self_evaluating, is_element_symbol, expr_value, make_element, LainType, make_output } from "./lain_element"
import type { LainElement } from "./lain_element"
import { ce_cached_lexical_lookup, define, type LexicalEnvironment, bind_to_env } from "./env"
import { define_generic_expr_handler } from "./compiler_helper"
import { cell_content, cell_name, cell_strongest_base_value, compound_propagator, construct_cell, construct_propagator, execute_all_tasks_sequential, inspect_strongest, PublicStateCommand, set_global_state, set_merge, simple_scheduler } from "ppropogator"
// Type imports separated to avoid Vite export issues
import type { Cell } from "ppropogator/Cell/Cell"
import type { Propagator } from "ppropogator/Propagator/Propagator"
import { ce_is_closure, ce_is_primitive, construct_closure_cell,  apply_primitive, apply_closure } from "./closure"
import { matched_lookup } from "./match_helper"
import type { ClosureTemplate } from "./closure/base"
import { cell_id, summarize_cells, update_cell } from "ppropogator/Cell/Cell"
import { is_map } from "ppropogator/Helper/Helper"
import { set_scheduler } from "ppropogator/Shared/Scheduler/Scheduler"
import { reactive_update } from "ppropogator/Helper/UI"
import { merge_temporary_value_set } from "ppropogator/DataTypes/TemporaryValueSet"
import { incremental_apply_closure } from "./closure"
// TODO: CE ZIP
// CE FOREACH

// what if compiler itself is a propagator?
// then we cannot use pattern matching
// can we support pattern matching to linked list in propagator?


export const apply_propagator = (operator: Cell<ClosureTemplate | ((...args: Cell<any>[]) => Propagator)>, operands_expr: LainElement[], env: LexicalEnvironment) => compound_propagator(
    [],
    [],
    () => {

        // applied propagator & closure can be tracable via parent child relationship
        // but we havn't implemented that yet

        // this part can be optimized because this can be static
        // we need to make sure that the value always sync back with scoped patch...
        // but how? 
        // console.log(cell_name(operator))
        // applied primitive can keep dependence graph traceble 
        const closure = ce_switch(ce_is_closure(operator), operator)
        // maybe applied function could be something inside a network?
        apply_closure(closure as Cell<ClosureTemplate>, operands_expr, env)

        const primitive = ce_switch(ce_is_primitive(operator), operator)
        apply_primitive(primitive as Cell<any>, operands_expr, env)
    },
    "apply_propagator"
)


import { pretentious_welcoming_message } from "./terminal_utils";
import { any_unusable_values } from "ppropogator/Cell/CellValue"
import { construct_layered_datum } from "sando-layer/Basic/LayeredDatum"
import { construct_vector_clock, vector_clock_layer } from "ppropogator/AdvanceReactivity/vector_clock"


export const init_system = () => {
    set_global_state(PublicStateCommand.CLEAN_UP);
    set_merge(merge_temporary_value_set);
    set_scheduler(simple_scheduler());
    
    pretentious_welcoming_message()
}

// right now it becomes problematic because of the scoped patch 
// and value store in scope
// maybe we need a seperation between value reader
// value writer
// and value inside the environment
export const compile = construct_simple_generic_procedure("compile", 1, (expr: string[]) => {
    return (env: LexicalEnvironment) => {
        const result = match(expr, [[P.element, 'operator'], [P.segment, 'operands']])
        if (isSucceed(result)) {
            const operator_expr = matched_lookup(result, "operator")
            const operands_expr = matched_lookup(result, "operands")            

            // console.log("compiling operator")
            const operator = trace_generic_procedure(console.log, compile, [operator_expr])(env)
            
            return apply_propagator(operator, operands_expr, env)
        }
    }
})

// how can we give constant cell a initial premises?
define_generic_expr_handler(compile, [[P.element, "constant", is_self_evaluating]], 
    (expr: string[], val: (key: string) => any) => {
    return (env: LexicalEnvironment) => {
        return constant_cell_from_expr((val("constant")))
    }
})

// symbol
define_generic_expr_handler(compile, [[P.element, "symbol", is_element_symbol]], 
    (expr: string[], val: (key: string) => any) => {
    return (env: LexicalEnvironment) => {
        const symbol_expr = val("symbol")
        // const value = construct_cell(symbol_expr.value + " | caller")
        // lookup(symbol_expr, env, value)
        return ce_cached_lexical_lookup(symbol_expr.value, env)
    }
})


const p_symbol = (symbol: string, name: string) => {
    const matcher = (x: LainElement) => {
        return is_element_symbol(x) && x.value === symbol
    }
    return [P.element, name, matcher]
}

const s_constant = (symbol: string) => p_symbol(symbol, symbol + "_constant")





define_generic_expr_handler(compile,
    [[s_constant("->"), [P.element, "A"]]],
    (expr: string[], val: (key: string) => any) => {
    return (env: LexicalEnvironment, source: Cell<any>, timestamp: number) => {
       const expr: LainElement = val("A")

       if (is_element_symbol(expr)) {
            const output = construct_cell(expr_value(expr))
            
            bind_to_env(expr_value(expr), output, env)
            return output
       }
       else {
            return compile(expr)(env)
       }
    }
})


// can network itself be a propagator?
// maybe it stills needs someway to rename a network?
// so maybe still a define?
// should network be anonymous?
// (network name (cells) (body))
// should a propagator all ready be created in here?
// or the network itself can be a cell
// a better expression could be (network name (cells) (body))
// or (network name (>:: cells) (::> cells) (body))
define_generic_expr_handler(compile, [[s_constant("network"), [P.element, "name"], 
    [s_constant(">::"), [P.segment, "inputs"]], 
    [s_constant("::>"), [P.segment, "outputs"]],
    [P.segment, "body"]
]], 
    (expr: string[], val: (key: string) => any) => {
    return (env: LexicalEnvironment) => {

       const closure = construct_closure_cell(
        env, 
        val("name"),
        val("inputs"),
        val("outputs"),
        val("body")
       )

       define(val("name"), env,  closure)
    //    console.log("closure", closure)
       
       return closure
    }
})



define_generic_expr_handler(compile, [[s_constant("?"), [P.element, "A"]]], 
    (expr: string[], val: (key: string) => any) => {
    return (env: LexicalEnvironment) => {
       const a = compile(val("A"))(env)
       execute_all_tasks_sequential(() => {});
       return a.summarize()
    }
})



define_generic_expr_handler(compile, [[s_constant("??"), [P.element, "A"]]], 
    (expr: string[], val: (key: string) => any) => {
    return (env: LexicalEnvironment) => {
        const e_map = cell_strongest_base_value(env) as Map<string, Cell<any>>
        if (is_map(e_map)) {
            const cell = e_map.get(expr_value(val("A")))
            if (cell) {
                const summary = summarize_cells([cell])
                console.log(summary)

                return cell
            }
            else {
                console.log("cell not found")
                return env
            }
        }
        else {
            console.log(cell_content(env))
            console.log(cell_strongest_base_value(env))
            return env
            
        }
    }
})

define_generic_expr_handler(compile, [[s_constant(">::"), [P.element, "cell"], [P.element, "value"]]], 
    (expr: string[], val: (key: string) => any) => {
    return (env: LexicalEnvironment) => {

        const e_map = cell_strongest_base_value(env) as Map<string, Cell<any>>
        if (is_map(e_map)) {
            const cell = e_map.get(expr_value(val("cell")))
            const value = expr_value(val("value"))
            if (cell) {
                reactive_update(cell, value)
            }
            execute_all_tasks_sequential(() => {});

            return cell
            
        }
        else {
            console.log("env contradicted")
            console.log(cell_content(env))
            console.log(cell_strongest_base_value(env))
            return env
        }
    }
})


// define_generic_expr_handler(compile, [["define", [P.element, "name"], [P.element, "body"]]],
//     (expr: string[], val: (key: string) => any) => {
//         return (env: LexicalEnvironment) => {
         
//          return define(val("name"), env, compile(val("body")))
//         }
//     }
// )


// const construct_meta_network =  (env: LexicalEnvironment, 
//     propagator_constructor: Cell<(...args: Cell<any>[]) => Propagator>, 
//     propagator: Cell<Propagator>,
//     name: string,
//     inputs: Cell<any>[],
//     outputs: Cell<any>[],
// ) => compound_propagator([propagator_constructor], [propagator],
//     () => {

//     },
//     name
// )



//define-network can be one of the macro, but lets deal with it later

// network



