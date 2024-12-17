import { isSucceed } from "pmatcher/Predicates"
import { run_matcher, P } from "pmatcher/MatchBuilder"
import { construct_advice, install_advice } from "generic-handler/built_in_generics/generic_advice"
import { MatchResult } from "pmatcher/MatchResult/MatchResult"
import { match_args, register_predicate } from "generic-handler/Predicates"
import { to_string } from "generic-handler/built_in_generics/generic_conversation"
import { construct_simple_generic_procedure, define_generic_procedure_handler } from "pmatcher/node_modules/generic-handler/GenericProcedure"
import { compile } from "pmatcher/MatchBuilder"
import type { MatchDict } from "pmatcher/MatchDict/MatchDict"
import { apply } from "pmatcher/MatchResult/MatchGenericProcs"
import type { LayeredObject } from "sando-layer/Basic/LayeredObject"
import { createMatcherInstance, internal_match, type matcher_instance } from "pmatcher/MatchCallback"
import { _is_type, get_value, is_lisp_list, LispType } from "../shared/type_layer"
import type { MatchEnvironment } from "pmatcher/MatchEnvironment"
import { match_array } from "pmatcher/MatchCombinator"
import { createMatchFailure, FailedReason } from "pmatcher/MatchResult/MatchFailure"
import { MatcherName } from "pmatcher/NameDict"
import { isArray } from "pmatcher/GenericArray"
function no_change(a: any) {
    return a
}


export function match_layered_array(all_matcher: matcher_instance[]): matcher_instance{
    const proc = (data: any, 
            dictionary: MatchDict, 
            match_env: MatchEnvironment, 
            succeed: (dictionary: MatchDict, nEaten: number) => any): any => {
        if (is_lisp_list(data)){
            //@ts-ignore
            return internal_match(match_array(all_matcher), get_value(data), dictionary, match_env, succeed)
        }
        else{
            return createMatchFailure("layered_array_matcher", 
                FailedReason.UnexpectedInput, data, null)
        }
    }
    //@ts-ignore
    return createMatcherInstance("layered_array_matcher", proc, new Map<string, any>([["matchers",all_matcher]]))
}

define_generic_procedure_handler(compile, isArray, match_layered_array)


export function make_matcher_register(expr: any[]): MatcherRegister {
    const matcher = (args: LayeredObject) => {
        return run_matcher(compile(expr), args, (d: MatchDict, e: number) => {return new MatchResult(d, e)})
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

export function match(expr: LayeredObject, matcher_instance: MatcherRegister): MatchResult{
    return matcher_instance.matcher(expr)
}

export function matcher_advice(): any[]{
    var matchResult: MatchResult | null = null  
    const input_modifers =  [no_change,
        (i: MatcherRegister) => {
           const matcher = register_predicate(to_string(i.expr), (input: LayeredObject, ...args: any[]) => {
                matchResult = i.matcher(input)
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

// const match = construct_simple_generic_procedure("match", 1, (a: any[]) => {return a}) 

// define_match_handler(match, 
//     make_matcher([[P.element, "a"], [P.segment, "rest"]]),
//     (exec: (...args: any[]) => any, ...args: any[]) => {
//         return exec((a: any, rest: any[]) => {
//             console.log(a)
//             console.log(rest)
//             return a
//         })
//     }
// )

// match(["a", "b", "c"])