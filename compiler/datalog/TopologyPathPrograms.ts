// SPDX-License-Identifier: GPL-3.0-or-later
//
// Copyright (c) 2024–2026 semi-0
//
// TopologyPathPrograms — path-shaped derivations over snapshot_topology_facts.
//
// Limits (important):
//   • `reachable/flows_to` (TopologyFacts) answers “is there *a* route?” — one
//     transitive closure, not path enumeration.
//   • To list **every** simple path between two cells (all intermediate cells
//     and propagators) you need bounded depth in Datalog **or** an external
//     search (BFS/DFS) over hops — the number of distinct paths can grow
//     exponentially and cyclic graphs have arbitrarily long walks.
//   • This module encodes **explicit** steps: `hop`, `path2`, `path3`, so each
//     derived fact names the propagators (and middle cells) on that segment.
//
// Edge model (same as topology_reachability_program):
//   hop(From, P, To) :- reads(P, From), writes(P, To).

import { V, atom, rule, program, type LogicProgram } from "./LogicProgram"
import { compose_programs } from "./TopologyFacts"

/** One propagator step: cell From → propagator P → cell To. */
export const topology_hop_program = (): LogicProgram =>
    program(
        "semi-naive",
        rule(
            atom("hop", V("From"), V("P"), V("To")),
            atom("reads", V("P"), V("From")),
            atom("writes", V("P"), V("To"))
        )
    )

/** Two hops: S →P1→ M →P2→ T (M is the middle cell). */
export const topology_path2_program = (): LogicProgram =>
    compose_programs(
        topology_hop_program(),
        program(
            "semi-naive",
            rule(
                atom("path2", V("S"), V("P1"), V("M"), V("P2"), V("T")),
                atom("hop", V("S"), V("P1"), V("M")),
                atom("hop", V("M"), V("P2"), V("T"))
            )
        )
    )

/** Three hops: S →P1→ M1 →P2→ M2 →P3→ T. */
export const topology_path3_program = (): LogicProgram =>
    compose_programs(
        topology_path2_program(),
        program(
            "semi-naive",
            rule(
                atom("path3", V("S"), V("P1"), V("M1"), V("P2"), V("M2"), V("P3"), V("T")),
                atom("hop", V("S"), V("P1"), V("M1")),
                atom("hop", V("M1"), V("P2"), V("M2")),
                atom("hop", V("M2"), V("P3"), V("T"))
            )
        )
    )
