import { isSucceed } from "pmatcher/Predicates"
import { run_matcher, P } from "pmatcher/MatchBuilder"
import { construct_advice, install_advice } from "generic-handler/built_in_generics/generic_advice"
import { MatchResult } from "pmatcher/MatchResult/MatchResult"
import { match_args, register_predicate } from "generic-handler/Predicates"
import { to_string } from "generic-handler/built_in_generics/generic_conversation"
import { define_generic_procedure_handler as define_compile_handler } from "pmatcher/node_modules/generic-handler/GenericProcedure"
import { match_args as pmatcher_match_args} from "pmatcher/node_modules/generic-handler/Predicates"
import { compile, match } from "pmatcher/MatchBuilder"
import { construct_simple_generic_procedure, define_generic_procedure_handler } from "generic-handler/GenericProcedure"
import type { MatchDict } from "pmatcher/MatchDict/MatchDict"
import { apply } from "pmatcher/MatchResult/MatchGenericProcs"
import type { LayeredObject } from "sando-layer/Basic/LayeredObject"
import { createMatcherInstance, internal_match, type matcher_instance } from "pmatcher/MatchCallback"
import { is_type, get_value, is_lisp_list, LispType } from "../shared/type_layer"
import type { MatchEnvironment } from "pmatcher/MatchEnvironment"
import { match_array } from "pmatcher/MatchCombinator"
import { createMatchFailure, FailedReason } from "pmatcher/MatchResult/MatchFailure"

import { is_any, is_array } from "generic-handler/built_in_generics/generic_predicates"
import { inspect } from "bun"
import { get_element, get_length, isArray, set_element } from "pmatcher/GenericArray"
import { is_scheme_list } from "../shared/type_predicates"

function no_change(a: any) {
    return a
}


// export function match_layered_array(all_matcher: matcher_instance[]): matcher_instance{
//     const proc = (data: any, 
//             dictionary: MatchDict, 
//             match_env: MatchEnvironment, 
//             succeed: (dictionary: MatchDict, nEaten: number) => any): any => {
//         if (is_lisp_list(data)){
//             //@ts-ignore
//             return internal_match(match_array(all_matcher), get_value(data), dictionary, match_env, succeed)
//         }
//         else if (is_array(data)){
//             console.log(data)
//             return internal_match(match_array(all_matcher), data, dictionary, match_env, succeed)
//         }
//         else{
//             return createMatchFailure("layered_array_matcher", 
//                 FailedReason.UnexpectedInput, data, null)
//         }
//     }
//     //@ts-ignore
//     return createMatcherInstance("layered_array_matcher", proc, new Map<string, any>([["matchers",all_matcher]]))
// }

// define_compile_handler(compile, is_array, (pattern: any[]) => {
//     // this unexpected covered other sub-pattern
//     return match_layered_array(pattern.map(compile))
// })


// confirm layered array to generic array

define_compile_handler(get_element,
    pmatcher_match_args(is_scheme_list, is_any),
    (array: LayeredObject, index: any) => {
        return get_value(array)[index]
    }
)

define_compile_handler(set_element,
    pmatcher_match_args(is_scheme_list, is_any, is_any),
    (array: LayeredObject, index: any, value: any) => {
        return get_value(array)[index] = value
    }
)

define_compile_handler(get_length,
    pmatcher_match_args(is_scheme_list),
    (array: LayeredObject) => {
        return get_value(array).length
    }
)

define_compile_handler(isArray,
    pmatcher_match_args(is_scheme_list),
    (a: any) => {
        return true
    }
)


export function make_matcher_register(expr: any[]): MatcherRegister {
    const matcher = (args: LayeredObject) => {
        return match(args, expr) 
    }

    return  {
        expr: expr,
        matcher: matcher
    }
}

interface MatcherRegister { 
    expr: any[], 
    matcher: (args: LayeredObject) => MatchResult
}

export function execute_match(expr: LayeredObject, matcher_instance: MatcherRegister): MatchResult{
    return matcher_instance.matcher(expr)
}

export function matcher_advice(): any[]{
    var matchResult: MatchResult | null = null  
    const input_modifers =  [no_change,
        (i: MatcherRegister) => {
           const matcher = register_predicate(to_string(i.expr), (input: LayeredObject, ...args: any[]) => {
                matchResult = i.matcher(input)
                // console.log(matchResult)
                return isSucceed(matchResult)
            })

           return match_args(matcher)
        },
        (handler: (exec: (...args: any[]) => any, ...args: any[]) => any) => { 
           return (result: any, ...args: any[]) => {
               //@ts-ignore
               return handler(make_exec(matchResult), ...args)
        }}]
    return construct_advice(input_modifers, no_change)
}

export const define_match_handler = install_advice(matcher_advice(), define_generic_procedure_handler)


const make_exec = (result: MatchResult) => {
    return (proc: (...args: any[]) => any) => {
        return apply(proc, result)
    }
}


/// simple test

// const try_match = construct_simple_generic_procedure("try_match", 1, (a: any[]) => {return a}) 

// define_match_handler(try_match, 
//     make_matcher_register([[P.element, "a"], [P.segment, "rest"]]),
//     (exec: (...args: any[]) => any, ...args: any[]) => {
//         return exec((a: any, rest: any[]) => {
//             console.log("executed")
//             console.log(a)
//             console.log(rest)
//             return a
//         })
//     }
// )

// try_match(["a", "b", "c"])