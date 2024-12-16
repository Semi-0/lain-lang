import { make } from "fp-ts/lib/Tree";
import { make_matcher } from "./matcher";
import { match, P } from "pmatcher/MatchBuilder";

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

// defaultly cell is curried
// (<-> [:name _] [:network ...]) => [:cells []]
// or (<-> <name>  <network> )
export const expr_propagator_constructor = make_matcher([
    propagator_tag(),
    parameter("name", [P.element, "name"]),
    parameter("cells", [[P.segment_independently, "cells"]]),
    parameter("activate", [P.element, "unwrapped_activate"])
])

export const expr_detailed_propagator_constructor = make_matcher([
    propagator_tag(),
    parameter("name", [P.element, "name"]),
    parameter("inputs", [[P.segment_independently, "inputs"]]),
    parameter("outputs", [[P.segment_independently, "outputs"]]),
    parameter("activate", [P.element, "unwrapped_activate"])
])

// (<> [:name _] [:value _]) or (<> <name> <value>) or (<> <name>) (with value as nothing) or (<> [:name _] [:subnet _])
// cell constructor is defaultly curried
export const expr_cell_constructor = make_matcher([
    keyword(["cell", "<>"]),
    parameter("name", [P.element, "name"]),
    optional_parameter("value", [P.element, "value"])
])

export const expr_apply_propagator = make_matcher([
    [P.element, "propagator"],
    parameter("cells", [P.segment, "cells"])
])

export const expr_detailed_apply_propagator = make_matcher([
    [P.element, "propagator"],
    parameter("inputs", [[P.segment, "inputs"]]),
    parameter("outputs", [[P.segment, "outputs"]])
])

export const expr_tell_cell = make_matcher([
    [P.element, "cell"],
    parameter("value", [P.element, "value"])
])

// analogouly to lambda expression and let expression
// (network [:cells []] [:body ...])
// or (network [<cells>] [<body>])
export const expr_network = make_matcher([
    [P.constant, "network"],
    parameter("cells", [[P.segment_independently, "cells"]]),
    parameter("body", [[P.segment_independently, "body"]])
])
