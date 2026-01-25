import { Applicability } from "generic-handler/Applicatability"
import { Predicate, register_predicate } from "generic-handler/Predicates"
import { match } from "pmatcher/MatchBuilder"
import { isSucceed } from "pmatcher/Predicates"
import { construct_simple_generic_procedure, define_generic_procedure_handler, trace_generic_procedure } from "generic-handler/GenericProcedure"
import { get_value } from "pmatcher/MatchDict/DictInterface"
import { MatchResult } from "pmatcher/MatchResult/MatchResult"
import type { LainElement } from "./lain_element"
import type { LexicalEnvironment } from "./env"

// Browser-compatible inspect function
const inspect = (typeof Bun !== "undefined" && Bun.inspect) 
    ? Bun.inspect 
    : (value: any) => JSON.stringify(value, null, 2);

export const define_generic_predicate = (name: string, predicate: (...args: any[]) => any) => {
    // const g_p = construct_simple_generic_procedure(name, 1, predicate)
    return register_predicate(name, predicate)
    
}

// still abstract pattern match could be more generic for different expression type
// but lets deal with this for now
export const define_generic_expr_handler = (procedure: (...args: any[]) => any, expr: any[], handler: (expr: string[], val: (key: string) => any) => any) => {
    var matched: MatchResult | undefined
    const matcher = new Applicability(
        "expr_matcher:" + expr.join(" "),
        [],
        (predicates: Predicate[]) =>
            (...args: any[]) => { 
                matched = match(args, expr)
                return isSucceed(matched)
            }
        
    )

    const force_get_dict_value = (key: string) => {
        if (isSucceed(matched)) {
            try {
                return matched!.safeGet(key)
            } catch (error) {
                throw new Error("value not found in matched dictionary, key: " + key + " error: " + error)
            }
        }
        else {
            throw new Error("match failed, expr: " + expr + "matched: " + inspect(matched))
        }
    }

    define_generic_procedure_handler(procedure, matcher, (expr: string[]) => handler(expr, force_get_dict_value))

}

export const load_compiler_parameters = (compiler: (expr: LainElement[] | LainElement) => (...args: any[]) => any, ...args: any[]) => {
    return (expr: LainElement[] | LainElement, env: LexicalEnvironment) => {
        const compiler_args = [env, ...args]
        // const try_compile = trace_generic_procedure(console.log, compiler, [expr])
        return compiler(expr)(...compiler_args)
    }
}