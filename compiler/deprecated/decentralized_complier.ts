// import { match } from "pmatcher/MatchBuilder"
// import { construct_simple_generic_procedure, trace_generic_procedure } from "generic-handler/GenericProcedure"
// import { isSucceed } from "pmatcher/Predicates"
// import { P } from "pmatcher/MatchBuilder"
// import { ce_switch } from "ppropogator/Propagator/BuiltInProps"
// import {  is_self_evaluating, is_element_symbol, type LainElement, expr_value, make_element, LainType } from "./lain_element"
// import { gun_constant } from "./env/decentralized_env"
// import { define, type LexicalEnvironment, p_output_to_env } from "./env"
// import { ce_lexical_lookup } from "./env/decentralized_env"
// import { define_generic_expr_handler } from "./compiler_helper"
// import { type Cell, cell_content, cell_name, cell_strongest_base_value, compound_propagator, construct_cell, execute_all_tasks_sequential, inspect_strongest, p_switch, type Propagator, PublicStateCommand, set_global_state, set_merge, simple_scheduler } from "ppropogator"
// import { apply_closure, f_apply_primitive, ce_is_closure, ce_is_primitive,  p_is_closure, apply_primitive } from "./closure"
// import { matched_lookup } from "./match_helper"
// import { type Closure } from "./closure"
// import { ce_list } from "ppropogator/DataTypes/CarriedCell"
// import { log_tracer } from "generic-handler/built_in_generics/generic_debugger"
// import { cell_neightbor_set, summarize_cells } from "ppropogator/Cell/Cell"
// import { is_map } from "ppropogator/Helper/Helper"
// import { run_scheduler_and_replay, set_scheduler } from "ppropogator/Shared/Scheduler/Scheduler"
// import { reactive_update } from "ppropogator/Helper/UI"
// import type { Primitive } from "d3-array"
// import { merge_layered } from "ppropogator/Cell/Merge"
// import { merge_temporary_value_set } from "ppropogator/DataTypes/TemporaryValueSet"
// import {  v4 as uuidv4 } from 'uuid';
// import { parse, State } from "parse-combinator";
// import { parseExpr } from "./parser";
// import { construct_closure } from "./env/decentralized_env"
// // TODO: CE ZIP
// // CE FOREACH

// // what if compiler itself is a propagator?
// // then we cannot use pattern matching
// // can we support pattern matching to linked list in propagator?

// // a crucial problem is what a closure should look like
// // how it could be partially evaluated?
// // and should we store the propagator inside environment?

// // how could we support partial evaluate?
// // i think it would be cool
// export const apply_propagator = (operator: Cell<Closure | ((...args: Cell<any>[]) => Propagator)>, operands_expr: LainElement[], env: LexicalEnvironment, db: IGunInstance) => compound_propagator(
//     [],
//     [],
//     () => {
//         // we need to make sure that the value always sync back with scoped patch...
//         // but how? 
//         // console.log(cell_name(operator))
//         const closure_cell = gun_cell_instance(db, "closure | " + operator.summarize()) as Cell<Closure>
//         const closure = p_switch(ce_is_closure(operator), operator, closure_cell)
//         // maybe applied function could be something inside a network?
//         apply_closure(closure_cell, operands_expr, env)

//         const primitive_cell = gun_cell_instance(db, "primitive | " + operator.summarize()) as Cell<Primitive>
//         const primitive = p_switch(ce_is_primitive(operator), operator, primitive_cell)
//         // @ts-ignore
//         apply_primitive(primitive_cell, operands_expr, env)
//     },
//     "apply_propagator"
// )


// import { pretentious_welcoming_message } from "./terminal_utils";
// import { IGunInstance } from "gun"
// import { gun_cell_instance } from "../DB/serialize/gun_cell"


// export const init_system = () => {

//     set_global_state(PublicStateCommand.CLEAN_UP);
//     set_merge(merge_temporary_value_set);
//     set_scheduler(simple_scheduler());
    
//     pretentious_welcoming_message()
// }


// export const run = (code: string, db: IGunInstance, env: Cell<LexicalEnvironment>) => {
//     const parsed = parse(parseExpr, new State(code))
//     if (parsed.success) {
//         const expr = parsed.value 
//         return compile(expr)(env, db)
//     }
//     throw new Error(`Parse failed: ${JSON.stringify(parsed)}`)
// }

// // there should be a smarter way to do this

// // and value inside the environment
// export const compile = construct_simple_generic_procedure("compile", 1, (expr: string[]) => {
//     return (env: LexicalEnvironment, db: IGunInstance) => {
//         const result = match(expr, [[P.element, 'operator'], [P.segment, 'operands']])
//         if (isSucceed(result)) {
//             const operator_expr = matched_lookup(result, "operator")
//             const operands_expr = matched_lookup(result, "operands")            

//             // console.log("compiling operator")
//             const operator = trace_generic_procedure(console.log, compile, [operator_expr])(env)
            
//             return apply_propagator(operator, operands_expr, env, db)
//         }
//     }
// })


// define_generic_expr_handler(compile, [[P.element, "constant", is_self_evaluating]], 
//     (expr: string[], val: (key: string) => any) => {
//     return (env: LexicalEnvironment, db: IGunInstance) => {
//         return gun_constant(db, val("constant"))
//     }
// })


// define_generic_expr_handler(compile, [[P.element, "symbol", is_element_symbol]], 
//     (expr: string[], val: (key: string) => any) => {
//     return (env: LexicalEnvironment, db: IGunInstance) => {
//         const symbol_expr = val("symbol")

//         return ce_lexical_lookup(symbol_expr.value, env, db, uuidv4())
//     }
// })


// const p_symbol = (symbol: string, name: string) => {
//     const matcher = (x: LainElement) => {
//         return is_element_symbol(x) && x.value === symbol
//     }
//     return [P.element, name, matcher]
// }

// const s_constant = (symbol: string) => p_symbol(symbol, symbol + "_constant")


// export const make_output = (expr: LainElement) => {
//     return [make_element(LainType.symbol, "->"), expr]
// }

// define_generic_expr_handler(compile,
//     [[s_constant("->"), [P.element, "A"]]],
//     (expr: string[], val: (key: string) => any) => {
//     return (env: LexicalEnvironment, db: IGunInstance) => {
//        const expr: LainElement = val("A")

//        if (is_element_symbol(expr)) {
//             const output = gun_cell_instance(db, expr_value(expr) + " | output", uuidv4())
//             p_output_to_env(expr_value(expr), output, env)
//             return output
//        }
//        else {
//             return compile(expr)(env)
//        }
//     }
// })


// // can network itself be a propagator?
// // maybe it stills needs someway to rename a network?
// // so maybe still a define?
// // should network be anonymous?
// // (network name (cells) (body))
// // should a propagator all ready be created in here?
// // or the network itself can be a cell
// // a better expression could be (network name (cells) (body))
// // or (network name (>:: cells) (::> cells) (body))
// define_generic_expr_handler(compile, [[s_constant("network"), [P.element, "name"], 
//     [s_constant(">::"), [P.segment, "inputs"]], 
//     [s_constant("::>"), [P.segment, "outputs"]],
//     [P.segment, "body"]
// ]], 
//     (expr: string[], val: (key: string) => any) => {
//     return (env: LexicalEnvironment, db: IGunInstance) => {

//        const closure = construct_closure(
//         db, env, 
//         val("name"),
//         val("inputs"),
//         val("outputs"),
//         val("body")
//        )

//        define(val("name"), env,  closure)
//     //    console.log("closure", closure)
       
//        return closure
//     }
// })



// define_generic_expr_handler(compile, [[s_constant("?"), [P.element, "A"]]], 
//     (expr: string[], val: (key: string) => any) => {
//     return (env: LexicalEnvironment) => {
//        const a = compile(val("A"))(env)
//        execute_all_tasks_sequential(() => {});
//        return a.summarize()
//     }
// })



// define_generic_expr_handler(compile, [[s_constant("??"), [P.element, "A"]]], 
//     (expr: string[], val: (key: string) => any) => {
//     return (env: LexicalEnvironment) => {
//         const e_map = cell_strongest_base_value(env) as Map<string, Cell<any>>
//         if (is_map(e_map)) {
//             const cell = e_map.get(expr_value(val("A")))
//             if (cell) {
//                 const summary = summarize_cells([cell])
//                 console.log(summary)

//                 return cell
//             }
//             else {
//                 console.log("cell not found")
//                 return env
//             }
//         }
//         else {
//             console.log(cell_content(env))
//             console.log(cell_strongest_base_value(env))
//             return env
            
//         }
//     }
// })

