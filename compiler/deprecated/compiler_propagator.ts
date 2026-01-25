// import { ce_and, ce_constant, ce_equal, ce_not, ce_subtract, cell_strongest, compound_propagator, construct_cell, construct_propagator, function_to_primitive_propagator, is_nothing, p_switch, p_sync, type Cell } from "ppropogator"
// import { is_element_boolean, is_lain_element, is_element_number, is_self_evaluating, is_element_string, is_element_symbol, LainElement } from "./lain_element"
// import { ce_car, ce_cdr, ce_combine_list, ce_cons, ce_dict_accessor, ce_dict_zip, ce_list_map, ce_struct, LinkedList, p_list_map } from "ppropogator/DataTypes/CarriedCell"
// import { p_lexical_lookup as lexical_lookup, LexicalEnvironment, parent_key } from "./env"
// import { make_ce_arithmetical } from "ppropogator/Propagator/Sugar"
// import { no_compute } from "ppropogator/Helper/noCompute"
// import { is_equal } from "generic-handler/built_in_generics/generic_arithmetic"
// import { Link } from "d3-shape"
// import { ce_linked_list_to_array } from  "ppropogator/DataTypes/CarriedCell"
// import { type Closure } from "./closure"
// import { p_constant } from "ppropogator/Propagator/BuiltInProps"
// import { update_cell } from "ppropogator/Cell/Cell"
// import { dependent_update } from "ppropogator/DataTypes/PremisesSource"

// // helper:
// // the long cond operator

// export interface cond_pair {
//     condition: (input: Cell<any>) => Cell<boolean>,
//     consequent: (input: Cell<any>) => Cell<any>,
// }


// export const p_cond = (input: Cell<any>, conds: cond_pair[], output: Cell<any>) => compound_propagator(
//     [input],
//     [output],
//     () => {
// // for each condition pair
// // it check whether last condition pair is ture
// // if they are not, execute this one
// // and it do something with the consequent
    
//     const p = (last_condition: Cell<boolean>, rest: cond_pair[]) => {
//         // the problem 

//         if (rest.length === 0){
//             // do nothing
//         }
//         else{
//             const this_predicate = rest[0].condition(input)
//             const this_consequent = rest[0].consequent

//             p_switch(ce_and(ce_not(last_condition), this_predicate), this_consequent(input), output)

//             p(this_predicate, rest.slice(1))
//         }
//     }
//     p(ce_constant(true), conds)
//     },
//     "cond"
// )


// export const p_is_lain_element = function_to_primitive_propagator("is_lain_element", is_lain_element)

// export const ce_is_lain_element = make_ce_arithmetical(p_is_lain_element, "is_lain_element")

// export const p_is_string_expr = function_to_primitive_propagator("is_string_expr", is_element_string)

// export const ce_is_string_expr = make_ce_arithmetical(p_is_string_expr, "is_string_expr")

// export const p_is_number_expr = function_to_primitive_propagator("is_number_expr", is_element_number)

// export const ce_is_number_expr = make_ce_arithmetical(p_is_number_expr, "is_number_expr")

// export const p_is_boolean_expr = function_to_primitive_propagator("is_boolean_expr", is_element_boolean)

// export const ce_is_boolean_expr = make_ce_arithmetical(p_is_boolean_expr, "is_boolean_expr")

// export const p_is_symbol_expr = function_to_primitive_propagator("is_symbol_expr", is_element_symbol)

// export const p_is_self_evaluating = function_to_primitive_propagator("is_self_evaluating", is_self_evaluating)

// export const ce_is_self_evaluating = make_ce_arithmetical(p_is_self_evaluating, "is_self_evaluating")


// export const make_expr = (name: string, f: (...args: any[]) => any) => 
//     make_ce_arithmetical(function_to_primitive_propagator(name, f), name)

// export const make_self_evaluate_cell = make_expr("self_evaluate_cell", (expr: LainElement) => {
//     if (is_element_string(expr)) {
//         return expr.value
//     }
//     else if (is_element_number(expr)) {
//         return expr.value
//     }
//     else if (is_element_boolean(expr)) {
//         return expr.value
//     }
//     else {
//         console.log("self_evaluate: i dont understand this expression", expr)
//         return no_compute
//     }

// })

// export const ce_lookup = (env: LexicalEnvironment) => (key: Cell<string>) => make_ce_arithmetical(lexical_lookup, "lookup")(key, env)

// export const ce_match_string = (matched_with: string)  => 
//     make_expr("match_string", (string: string) => {
//         return is_equal(string, matched_with)
//     })


// export const head_match = (matched_with: string) => (expr: Cell<LinkedList>, output: Cell<boolean>) => 
//     compound_propagator(
//         [expr],
//         [output],
//         () => {
//             const head = ce_car(expr)
//             p_sync(ce_match_string(matched_with)(head), output)
//         },
//         "head_match"
//     )

// export const c_nth_element = (index: Cell<number>, list: Cell<LinkedList>, output: Cell<any>) => compound_propagator(
//     [list],
//     [output],
//     () => {
//         const is_head = ce_equal(index, ce_constant(0))
//         p_switch(
//             is_head,
//             ce_car(list),
//             output
//         )

//         c_nth_element(ce_subtract(index, ce_constant(1)), ce_cdr(list), output)

//     },
//     "nth_element"
// )

// // shorthand syntax for nth_element 
// export const ce_nth_element = make_ce_arithmetical(c_nth_element, "nth_element")

// export const nth_element = (index: number) => (list: Cell<LinkedList>) => ce_nth_element(ce_constant(index), list)



// export const is_network_expr = (expr: Cell<LinkedList>, output: Cell<any>) => compound_propagator(
//     [expr],
//     [output],
//     () => {
//         head_match("network")(expr, output)
//     },
//     "is_network_expr"
// )


// export const ce_network_expr_name = (expr: Cell<LinkedList>) => nth_element(1)(expr) 

// export const ce_network_expr_inputs = (expr: Cell<LinkedList>) => nth_element(2)(expr)

// export const ce_network_expr_outputs = (expr: Cell<LinkedList>) => nth_element(3)(expr)

// export const ce_network_expr_body = (expr: Cell<LinkedList>) => nth_element(4)(expr)


// export const ce_closure = (expr: Cell<LinkedList>) => ce_struct({
//         name: ce_network_expr_name(expr),
//         inputs: ce_network_expr_inputs(expr),
//         outputs: ce_network_expr_outputs(expr),
//         body: ce_network_expr_body(expr)
// })


// export const apply_closure = (closure: Cell<Closure>, operands: Cell<Map<string, Cell<any>>>, env: LexicalEnvironment, output: Cell<any>) => compound_propagator(
//         [closure, env],
//         [closure],
//         () => {
//             // extend the env to a new sub_env
//             // extends operands with cell_to_built in the env
//             // then apply the propagator constructor to those cells
    
//             // this operands are going to be cells have not introduced to environment yet
//             // assume we have a compound propagator that defaultly have output be the last operand
//             // env should be extended with new cells to resolve that when activate
     
//             const name = ce_dict_accessor("name")(closure)
//             // inputs are linked list of cells
//             // but linked list are in carried cell format
//             // so they can't be directly compiled
//             // unless 1. compiler is a propagator that can handles linked list
//             // 2. we have a way to convert back from linked list to array
//             const inputs = ce_dict_accessor("inputs")(closure)
//             const outputs = ce_dict_accessor("outputs")(closure)
//             const vars = ce_combine_list(inputs, outputs)
    
//             const sub_env = ce_dict_zip(
//                 ce_cons(ce_constant(parent_key), vars),
//                 ce_cons(env, operands),
//             )
    
//             const bodies = ce_dict_accessor("body")(closure)

//             const is = ce_linked_list_to_array(ce_list_map(ce_carried_compile(sub_env), inputs))
//             const os = ce_linked_list_to_array(ce_list_map(ce_carried_compile(sub_env), outputs))
        
//             // i know this is not generic
//             // compound propagator cannot resolve cell
//             // this becomes a big problem
//             compound_propagator(
//                 [sub_env, is, os, name],
//                 [sub_env],
//                 () => {
//                     // we can not just compile
//                     // we need to resolve the cell and propagator closure 
//                     // inside the body
//                     // them build the compound propagator
                    
//                     const result = compound_propagator(
//                         cell_strongest(is) as Cell<any>[],
//                         cell_strongest(os) as Cell<any>[],
//                         () => {
//                             // if it pre-knows what propagator closure it is 
//                             // can it dynamically switch?
//                             ce_carried_compile(sub_env)(bodies)
//                         },
//                         cell_strongest(name) + "resolve"
//                     )

//                     p_constant(result)(closure, output)
//                 },
//               "closure_resolve"
//             )
//         },
//         "apply_closure"
//     )

// export const otherwise = (consequent: (input: Cell<any>) => Cell<any>) => ({
//     condition: () => construct_cell("true"),
//     consequent: consequent
// })


// export const apply_propagator = (operator: Cell<Closure>, operands: Cell<Map<string, Cell<any>>>, env: LexicalEnvironment, output: Cell<any>) => compound_propagator(
//     [operator, env],
//     [operator, env],
//     () => {
//         apply_closure(operator, operands, env, output)
//     },
//     "apply_propagator"
// )

// export const c_compile = (expr_input: Cell<LinkedList>, env: LexicalEnvironment, output: Cell<any>) => compound_propagator(
//     [expr_input, env],
//     [env, output],
//     () => {
//         p_cond(
//             expr_input,
//             [
//                 {
//                     condition: is_self_evaluating,
//                     consequent: make_self_evaluate_cell
//                 },
//                 {
//                     condition: is_element_symbol,
//                     consequent: ce_lookup(env)
//                 },
//                 {
//                     condition: is_network_expr,
//                     consequent: ce_closure
//                 },
//                 otherwise(
//                     (expr: Cell<LinkedList>) => {
//                         const operator = ce_car(expr)
//                         const operands = ce_cdr(expr)
//                         const result = construct_cell("result")
//                         apply_propagator(operator, operands, env, result)
//                         return result
//                     }
//                 )
//             ],
//             output
//         )
//     },
//     "compile"
// )

// export const ce_compile: (expr: Cell<LinkedList>, env: LexicalEnvironment) => Cell<any> = make_ce_arithmetical(c_compile, "compile")

// export const ce_carried_compile = (env: LexicalEnvironment) => (expr: Cell<LinkedList>) => ce_compile(expr, env)

// // ============================================================================
// // Utility Propagators
// // ============================================================================

// export const cell_is_empty = (input: Cell<any>, output: Cell<boolean>) => construct_propagator([input], [output], () => {
//     // here is a problem how can we make sure that this state changes?
//     // then we need to make sure victor clock layer is working in early state 
//     // lets consider that after we need to deal with closure
//     if (is_nothing(cell_strongest(input))) {
//         update_cell(output, true)
//     }
//     else {
//         update_cell(output, false)
//     }
// }, "cell_is_empty")

// export const update_compiler = dependent_update("compiler")

// export const p_is_empty = (a: Cell<any>, out: Cell<any>) => construct_propagator(
//     [a],
//     [out],
//     () => {
//         // because it changed so it raced a contradiction

  
//         update_compiler(
//             new Map([[out, is_nothing(cell_strongest(a))]])
//         )

//         // update_cell(
//         //     out,
//         //     make_layered_procedure("is_nothing", 1, is_nothing)(cell_strongest(a))
//         // )
//     },
//     "p_is_empty"
// )

// export const ce_is_empty = make_ce_arithmetical(p_is_empty)

// // if A have value ignore B
// export const p_race = (a: Cell<any>, b: Cell<any>, out: Cell<any>) =>  compound_propagator(
//     [],
//     [out],
//     () => {
//         const a_is_empty = ce_is_empty(a) as Cell<boolean>

//         // inspect_strongest(console.log)(out)

//         p_switch(
//             a_is_empty,
//             b,
//             out
//         )

//         p_switch(
//             ce_not(a_is_empty),
//             a,
//             out
//         )
//         // p-race didn't consider the scenario of sync back
//     },
//     "race"
// )