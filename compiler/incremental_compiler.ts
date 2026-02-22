import { match } from "pmatcher/MatchBuilder"
import { construct_simple_generic_procedure, trace_generic_procedure } from "generic-handler/GenericProcedure"
import { isSucceed } from "pmatcher/Predicates"
import { P } from "pmatcher/MatchBuilder"
import { ce_constant, ce_switch } from "ppropogator/Propagator/BuiltInProps"
import { constant_cell_from_expr,  is_self_evaluating, is_element_symbol, expr_value, make_element, LainType, make_output } from "./lain_element"
import type { LainElement } from "./lain_element"
import { ce_cached_lexical_lookup, define, type LexicalEnvironment, lookup, bind_to_env } from "./env"
import { define_generic_expr_handler, load_compiler_parameters } from "./compiler_helper"
import { cell_content, cell_name, cell_strongest_base_value, compound_propagator, construct_cell, construct_propagator, execute_all_tasks_sequential, inspect_strongest, PublicStateCommand, set_global_state, set_merge, simple_scheduler } from "ppropogator"
// Type imports separated to avoid Vite export issues
import type { Cell } from "ppropogator/Cell/Cell"
import type { Propagator } from "ppropogator/Propagator/Propagator"
import { ce_is_closure, ce_is_primitive, construct_closure_cell,  apply_primitive, apply_closure, incremental_apply_primitive, install_merge_closure_incremental } from "./closure"
import { matched_lookup } from "./match_helper"
import type { ClosureTemplate } from "./closure/base"
import { cell_id, summarize_cells, update_cell } from "ppropogator/Cell/Cell"
import { is_map } from "ppropogator/Helper/Helper"
import { set_scheduler } from "ppropogator/Shared/Scheduler/Scheduler"
import { reactive_update } from "ppropogator/Helper/UI"
import { merge_temporary_value_set } from "ppropogator/DataTypes/TemporaryValueSet"
import { incremental_apply_closure } from "./closure"
import { construct_closure } from "./closure"
// TODO: CE ZIP
// CE FOREACH

// what if compiler itself is a propagator?
// then we cannot use pattern matching
// can we support pattern matching to linked list in propagator?


/**
 * Incremental Compiler
 * 
 * A reactive compiler implemented using the propagator paradigm.
 * Unlike traditional compilers, this system treats code as live data.
 * Changes to definitions (like closures) propagate through the network
 * and trigger automatic re-compilation and hot-swapping of the affected
 * parts of the execution graph.
 */

export const incremental_apply_propagator = (operator: Cell<ClosureTemplate | ((...args: Cell<any>[]) => Propagator)>, operands_expr: LainElement[], env: LexicalEnvironment, source: Cell<any>, timestamp: number) =>  {
        const closure = ce_switch(ce_is_closure(operator), operator)

        const parameterized_compile = load_compiler_parameters(incremental_compile, source, timestamp)
        // // maybe applied function could be something inside a network?
        incremental_apply_closure(closure as Cell<ClosureTemplate>, operands_expr, env, parameterized_compile)

        const primitive = ce_switch(ce_is_primitive(operator), operator)

        incremental_apply_primitive(primitive as Cell<any>, operands_expr, env, parameterized_compile)
    }


import { pretentious_welcoming_message } from "./terminal_utils";
import { construct_layered_datum } from "sando-layer/Basic/LayeredDatum"
import { construct_vector_clock, vector_clock_layer } from "ppropogator/AdvanceReactivity/vector_clock"
import { p_reactive_dispatch, source_has_neighbor, update_source_cell } from "ppropogator/DataTypes/PremisesSource"



export const init_system = () => {
    set_global_state(PublicStateCommand.CLEAN_UP);
    // install_merge_closure_incremental(merge_temporary_value_set)
    set_merge(merge_temporary_value_set);
    set_scheduler(simple_scheduler());
    pretentious_welcoming_message()
}

// right now it becomes problematic because of the scoped patch 
// and value store in scope
// maybe we need a seperation between value reader
// value writer
// and value inside the environment
export const incremental_compile = construct_simple_generic_procedure("incremental_compile", 1, (expr: string[]) => {
    return (env: LexicalEnvironment, source_cell: Cell<any>, timestamp: number) => {
        const result = match(expr, [[P.element, 'operator'], [P.segment, 'operands']])
        if (isSucceed(result)) {
            const operator_expr = matched_lookup(result, "operator")
            const operands_expr = matched_lookup(result, "operands")            

            // console.log("compiling operator")
            const operator = incremental_compile(operator_expr)(env, source_cell, timestamp)

            
            return incremental_apply_propagator(operator, operands_expr, env, source_cell, timestamp)
        }
    }
})

// how can we give constant cell a initial premises?
define_generic_expr_handler(incremental_compile, [[P.element, "constant", is_self_evaluating]], 
    (expr: string[], val: (key: string) => any) => {
    return (env: LexicalEnvironment, source_cell: Cell<any>, timestamp: number) => {
        return constant_cell_from_expr((val("constant")))
    }
})

// symbol
define_generic_expr_handler(incremental_compile, [[P.element, "symbol", is_element_symbol]], 
    (expr: string[], val: (key: string) => any) => {
    return (env: LexicalEnvironment, source_cell: Cell<any>, timestamp: number) => {
        const symbol_expr = val("symbol")
        // const value = construct_cell(symbol_expr.value + " | caller")
        // lookup(symbol_expr, env, value)
        return ce_cached_lexical_lookup(expr_value(symbol_expr), env)
    }
})


const p_symbol = (symbol: string, name: string) => {
    const matcher = (x: LainElement) => {
        return is_element_symbol(x) && x.value === symbol
    }
    return [P.element, name, matcher]
}

const s_constant = (symbol: string) => p_symbol(symbol, symbol + "_constant")




define_generic_expr_handler(incremental_compile,
    [[s_constant("->"), [P.element, "A"]]],
    (expr: string[], val: (key: string) => any) => {
    return (env: LexicalEnvironment, source_cell: Cell<any>, timestamp: number) => {
       const expr: LainElement = val("A")

       if (is_element_symbol(expr)) {
            const output = construct_cell(expr_value(expr))
         
            bind_to_env(expr_value(expr), output, env)
            return output
       }
       else {
            return incremental_compile(expr)(env)
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
define_generic_expr_handler(incremental_compile, [[s_constant("network"), [P.element, "name"], 
    [s_constant(">::"), [P.segment, "inputs"]], 
    [s_constant("::>"), [P.segment, "outputs"]],
    [P.segment, "body"]
]], 
    (expr: string[], val: (key: string) => any) => {
    return (env: LexicalEnvironment, source_cell: Cell<any>, timestamp: number) => {
    
        // this is troublesome because source_cell cannot gather data
       const closure = construct_closure(
        env, 
        val("name"),
        val("inputs"),
        val("outputs"),
        val("body")
       )
       // need a better source cell which can accumulate data 
    //    const closure_cell = ce_dependents(source_cell)
       const closure_cell =  incremental_compile(make_output(val("name")))(env, source_cell, timestamp)

       update_cell(
        closure_cell,
        construct_layered_datum(
            closure,
            vector_clock_layer,
            construct_vector_clock([{
                source: cell_id(source_cell),
                value: timestamp
            }])
        ) 
       )

       
       return closure
    }
})



define_generic_expr_handler(incremental_compile, [[s_constant("?"), [P.element, "A"]]], 
    (expr: string[], val: (key: string) => any) => {
    return (env: LexicalEnvironment, source_cell: Cell<any>, timestamp: number) => {
       const a = incremental_compile(val("A"))(env)
       execute_all_tasks_sequential(() => {});
       return a.summarize()
    }
})



define_generic_expr_handler(incremental_compile, [[s_constant("??"), [P.element, "A"]]], 
    (expr: string[], val: (key: string) => any) => {
    return (env: LexicalEnvironment, source_cell: Cell<any>, timestamp: number) => {
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

define_generic_expr_handler(incremental_compile, [[s_constant(">::"), [P.element, "cell"], [P.element, "value"]]], 
    (expr: string[], val: (key: string) => any) => {
    return (env: LexicalEnvironment, source_cell, timestamp) => {

        const e_map = cell_strongest_base_value(env) as Map<string, Cell<any>>
        if (is_map(e_map)) {
            const cell = e_map.get(expr_value(val("cell")))
            if (cell) {
                if (source_has_neighbor(source_cell, cell)) {
                    update_source_cell(source_cell, new Map([[cell, expr_value(val("value"))]]))
                }
                else {
                    p_reactive_dispatch(source_cell, cell)
                    update_source_cell(source_cell, new Map([[cell, expr_value(val("value"))]]))
                }
            }
            
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

