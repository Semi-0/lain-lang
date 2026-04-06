// SPDX-License-Identifier: GPL-3.0-or-later
//
// Copyright (c) 2024–2026 semi-0
//
// Orientation summaries on top of topology reachability: mutual SCC-style pairs
// and directed “surface” edges among three anchor cell ids (through intermediates).

import {
    V,
    atom,
    rule,
    program,
    NegFact,
    type LogicProgram,
    type ExecutionStrategy,
} from "./LogicProgram"
import { compose_programs, topology_reachability_program } from "./TopologyFacts"

/** `reachable` + `mutual_reach(X,Y) :- reachable(X,Y), reachable(Y,X)`. Pure Horn. */
export const topology_mutual_reach_program = (
    strategy: ExecutionStrategy = "semi-naive"
): LogicProgram =>
    compose_programs(
        topology_reachability_program(strategy),
        program(
            strategy,
            rule(
                atom("mutual_reach", V("X"), V("Y")),
                atom("reachable", V("X"), V("Y")),
                atom("reachable", V("Y"), V("X"))
            )
        ),
        strategy
    )

/**
 * For three concrete cell ids, projects the full graph onto:
 * - `surface_dir(A,B)` iff `reachable(A,B)` among the triad (six directed pairs).
 * - `surface_mutual(A,B)` iff `mutual_reach(A,B)` for pairs in the triad (both orders).
 *
 * One-way A→B: `surface_dir(A,B)` with no `surface_mutual(A,B)` (equivalently no
 * `surface_dir(B,A)`). Bilateral: both `surface_dir` directions and `surface_mutual`.
 */
export const topology_triad_surface_program = (
    a: string,
    b: string,
    c: string,
    strategy: ExecutionStrategy = "semi-naive"
): LogicProgram => {
    const directed: [string, string][] = [
        [a, b],
        [b, a],
        [a, c],
        [c, a],
        [b, c],
        [c, b],
    ]
    const dirRules = directed.map(([x, y]) =>
        rule(atom("surface_dir", x, y), atom("reachable", x, y))
    )
    const undirected: [string, string][] = [
        [a, b],
        [a, c],
        [b, c],
    ]
    const mutRules: ReturnType<typeof rule>[] = []
    for (const [x, y] of undirected) {
        mutRules.push(rule(atom("surface_mutual", x, y), atom("mutual_reach", x, y)))
        mutRules.push(rule(atom("surface_mutual", y, x), atom("mutual_reach", x, y)))
    }
    return compose_programs(
        topology_mutual_reach_program(strategy),
        program(strategy, ...dirRules, ...mutRules),
        strategy
    )
}

/**
 * **Second-stage** program only: EDB must already contain closed `reachable/2`
 * (e.g. output of `topology_mutual_reach_program`). Derives
 * `surface_one_way(X,Y)` when `reachable(X,Y)` and there is **no** `reachable(Y,X)`.
 * Compose with `wire_sequential_programs(edb, [mutual_reach_prog, this], …)`.
 */
export const topology_triad_one_way_surface_program = (
    a: string,
    b: string,
    c: string,
    strategy: ExecutionStrategy = "semi-naive"
): LogicProgram => {
    const directed: [string, string][] = [
        [a, b],
        [b, a],
        [a, c],
        [c, a],
        [b, c],
        [c, b],
    ]
    return program(
        strategy,
        ...directed.map(([x, y]) =>
            rule(
                atom("surface_one_way", x, y),
                atom("reachable", x, y),
                NegFact(atom("reachable", y, x))
            )
        )
    )
}
