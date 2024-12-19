import { make } from "fp-ts/lib/Tree";
import { make_matcher_register } from "./matcher";
import { match, P } from "pmatcher/MatchBuilder";
import { is_scheme_symbol, is_self_evaluate } from "../shared/type_predicates"

function keyword(names: string[]) {
    const constants = names.map((name) => [P.constant, name])
    return  [P.choose, ...constants]
}

function name_tag(name: string) {
    return ":" + name
}

function parameter(name: string, matcher_expr: any[]) {
    // optional name tag
    return  [P.choose, [[P.constant, name_tag(name)], matcher_expr], matcher_expr]
}

function optional_parameter(name: string, matcher_expr: any[]) {
    return [P.choose, parameter(name, matcher_expr), [P.segment, "empty"]]
}

function propagator_tag() {
    return keyword(["propagator", "prop", "<->"])
}


export const expr_self_evaluate = make_matcher_register([
    [P.element, "expr", is_self_evaluate]
])

export const expr_var = make_matcher_register([
    [P.element, "expr", is_scheme_symbol]
]) 

export const expr_quoted = make_matcher_register(
    ["quote", [P.element, "expr"]]
)


export const expr_application = make_matcher_register([
    [P.element, "propagator"],  
    parameter("cells", [P.segment, "cells"])
])
// defaultly cell is curried
// (<-> [:name _] [:network ...]) => [:cells []]
// or (<-> <name>  <network> )
export const expr_propagator_constructor = make_matcher_register([
    propagator_tag(),
    parameter("inputs", [[P.segment_independently, "inputs"]]),
    parameter("outputs", [[P.segment_independently, "outputs"]]),
    parameter("activate", [P.element, "unwrapped_activate"])
])

// (<> [:name _] [:value _]) or (<> <name> <value>) or (<> <name>) (with value as nothing) or (<> [:name _] [:subnet _])
// cell constructor is defaultly curried
export const expr_primitive_cell_constructor = make_matcher_register([
    keyword(["primitive-cell", "<>"]),
    optional_parameter("value", [P.element, "value"])
])

export const expr_tell_cell = make_matcher_register([
    keyword(["tell", "<~"]),
    [P.element, "cell"],
    parameter("value", [P.element, "value"])
])

export const expr_define = make_matcher_register([
    keyword(["define"]),
    parameter("name", [P.element, "name"]),
    parameter("value", [P.element, "value"])
])

// analogouly to lambda expression and let expression
// (network [:cells []] [:body ...])
// or (network [<cells>] [<body>])
// export const expr_network = make_matcher_register([
//     [P.constant, "network"],
//     parameter("cells", [[P.segment_independently, "cells"]]),
//     parameter("body", [[P.segment_independently, "body"]])
// ])
