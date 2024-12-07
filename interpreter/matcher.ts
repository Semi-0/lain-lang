import { isSucceed } from "pmatcher/Predicates"
import { run_matcher, P } from "pmatcher/MatchBuilder"
import { construct_advice, install_advice } from "generic-handler/built_in_generics/generic_advice"
import { MatchResult } from "pmatcher/MatchResult/MatchResult"
import { match_args, register_predicate } from "generic-handler/Predicates"
import { to_string } from "generic-handler/built_in_generics/generic_conversation"
import { construct_simple_generic_procedure, define_generic_procedure_handler } from "generic-handler/GenericProcedure"
import { compile } from "pmatcher/MatchBuilder"
import type { MatchDict } from "pmatcher/MatchDict/MatchDict"
import { apply } from "pmatcher/MatchResult/MatchGenericProcs"
function no_change(a: any) {
    return a
}

export function make_matcher(expr: any[]) {
    const matcher = (args: any[]) => {
        return run_matcher(compile(expr), args, (d: MatchDict, e: number) => {return new MatchResult(d, e)})
    }

    return  {
        expr: expr,
        matcher: matcher
    }
}

interface MatcherInstance { 
    expr: any[], 
    matcher: (args: any[]) => MatchResult
}

export function matcher_advice(): any[]{
    var matchResult: MatchResult | null = null  
    const input_modifers =  [no_change,
        (i: MatcherInstance) => {
           const matcher = register_predicate(to_string(i.expr), (input: any[], ...args: any[]) => {
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