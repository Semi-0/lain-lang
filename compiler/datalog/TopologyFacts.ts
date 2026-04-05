// SPDX-License-Identifier: GPL-3.0-or-later
//
// Copyright (c) 2024–2026 semi-0
//
// TopologyFacts — snapshot the live propagator network as Datalog facts,
// and provide pre-built LogicProgram declarations for common topology queries.
//
// ── Extended fact schema ──────────────────────────────────────────────────────
//
//   ["cell",       cellId, cellName]          – every cell
//   ["propagator", propId, propName]          – every propagator
//   ["reads",      propId, cellId]            – propagator reads cell (input)
//   ["writes",     propId, cellId]            – propagator writes cell (output)
//   ["kind",       nodeId, "cell"|"prop"]     – node kind
//   ["namespace",  nodeId, namespaceStr]      – first "|"-segment of label
//   ["level",      nodeId, levelStr]          – relation nesting depth (as string)
//   ["label",      nodeId, labelStr]          – full label string
//   ["value",      cellId, valueStr]          – strongest base value as string (cells only)
//
// ── Pre-built programs (declarations, not execution) ─────────────────────────
//
//   topology_reachability_program   – derives flows_to + reachable
//   cell_namespace_program(prefix)  – derives ns_match(X) for cells in namespace
//   cell_kind_program(kind)         – derives kind_match(X) for cells/props of kind
//   cell_level_program(level)       – derives level_match(X) at a given depth
//   connected_to_program(nodeId)    – derives reachable from a specific node

import {
    cell_snapshot,
    propagator_snapshot,
    type Cell,
    cell_id,
    cell_name,
    construct_cell,
    add_cell_content as update_cell,
    propagator_id,
    construct_propagator,
} from "ppropogator"
import { cell_level } from "ppropogator/Cell/Cell"
import { propagator_level } from "ppropogator/Propagator/Propagator"
import { cell_strongest_base_value } from "ppropogator"
import type { Fact } from "pmatcher/new_match/MiniDatalog"
import { to_string } from "generic-handler/built_in_generics/generic_conversation"
import {
    make_fact_set,
    type FactSet,
    install_datalog_handlers,
    run_program,
} from "./DatalogPropagator"
import {
    V, Eq, Or,
    atom, rule, program, query_decl,
    StartsWith, Is,
    type LogicProgram, type QueryDecl, type ExecutionStrategy,
} from "./LogicProgram"

// ─── Namespace derivation ─────────────────────────────────────────────────────

/** Derive the namespace from a label string (first "|"-separated segment). */
const label_to_namespace = (label: string): string => label.split("|")[0] ?? ""

/** Derive a display label for a cell or propagator. */
const make_label = (name: string): string => name

// ─── Topology snapshot ────────────────────────────────────────────────────────

/**
 * Read the current propagator network and return it as a flat Datalog fact set.
 *
 * Reads from the global cell/propagator snapshot registers, so it reflects
 * the network state at the moment of the call.
 */
export const snapshot_topology_facts = (): Fact[] => {
    const facts: Fact[] = []

    for (const cell of cell_snapshot()) {
        const id   = cell_id(cell)
        const name = cell_name(cell)
        const ns   = label_to_namespace(name)
        const lvl  = String(cell_level(cell))
        const val  = cell_strongest_base_value(cell)

        facts.push(["cell",      id, name])
        facts.push(["kind",      id, "cell"])
        facts.push(["namespace", id, ns])
        facts.push(["level",     id, lvl])
        facts.push(["label",     id, name])

        if (val !== undefined && val !== null) {
            try {
                facts.push(["value", id, to_string(val)])
            } catch { /* value not stringifiable — skip */ }
        }
    }

    for (const prop of propagator_snapshot()) {
        const pid  = propagator_id(prop)
        const name = prop.getName()
        const ns   = label_to_namespace(name)
        const lvl  = String(propagator_level(prop))

        facts.push(["propagator", pid, name])
        facts.push(["kind",       pid, "prop"])
        facts.push(["namespace",  pid, ns])
        facts.push(["level",      pid, lvl])
        facts.push(["label",      pid, name])

        for (const input of prop.getInputs()) {
            facts.push(["reads", pid, cell_id(input)])
        }
        for (const output of prop.getOutputs()) {
            facts.push(["writes", pid, cell_id(output)])
        }
    }

    return facts
}

// ─── Topology fact cell ───────────────────────────────────────────────────────

/**
 * Build a Cell<FactSet> that re-snapshots the network topology whenever
 * `trigger` changes.  Attach trigger to a sentinel cell updated each compile
 * step or whenever the topology might have changed.
 */
export const construct_topology_fact_cell = (trigger: Cell<any>): Cell<FactSet> => {
    install_datalog_handlers()
    const topo_cell = construct_cell<FactSet>("topology_facts")

    construct_propagator(
        [trigger],
        [topo_cell],
        () => update_cell(topo_cell, make_fact_set(snapshot_topology_facts())),
        "topology_snapshot"
    )

    return topo_cell
}

// ─── Pre-built LogicProgram declarations ─────────────────────────────────────
//  All are pure data (no propagator created here).  Pass to run_program() or
//  run_query() to create executing propagators.

/**
 * Derives `flows_to(A, B)` and `reachable(A, B)` from base topology facts.
 *
 *   flows_to(A, B)   :- reads(P, A), writes(P, B)
 *   reachable(A, B)  :- flows_to(A, B)
 *   reachable(A, C)  :- reachable(A, B), flows_to(B, C)
 */
export const topology_reachability_program = (
    strategy: ExecutionStrategy = "semi-naive"
): LogicProgram =>
    program(strategy,
        rule(atom("flows_to",  V("A"), V("B")),
             atom("reads",  V("P"), V("A")),
             atom("writes", V("P"), V("B"))),

        rule(atom("reachable", V("A"), V("B")),
             atom("flows_to", V("A"), V("B"))),

        rule(atom("reachable", V("A"), V("C")),
             atom("reachable", V("A"), V("B")),
             atom("flows_to",  V("B"), V("C"))),
    )

/**
 * Derives `ns_match(X)` for every node whose namespace starts with `prefix`.
 *
 *   ns_match(X) :- kind(X, _), namespace(X, NS), StartsWith(NS, prefix)
 */
export const cell_namespace_program = (
    prefix: string,
    strategy: ExecutionStrategy = "semi-naive"
): LogicProgram =>
    program(strategy,
        rule(atom("ns_match", V("X")),
             atom("kind",      V("X"), V("_K")),
             atom("namespace", V("X"), V("NS")),
             StartsWith(V("NS"), prefix)),
    )

/**
 * Derives `kind_match(X)` for nodes of a given kind ("cell" or "prop").
 *
 *   kind_match(X) :- kind(X, kind)
 */
export const cell_kind_program = (
    kind: "cell" | "prop",
    strategy: ExecutionStrategy = "semi-naive"
): LogicProgram =>
    program(strategy,
        rule(atom("kind_match", V("X")),
             atom("kind", V("X"), kind)),
    )

/**
 * Derives `level_match(X)` for nodes at exactly `level` (converted to string).
 *
 *   level_match(X) :- level(X, levelStr)
 */
export const cell_level_program = (
    level: number,
    strategy: ExecutionStrategy = "semi-naive"
): LogicProgram =>
    program(strategy,
        rule(atom("level_match", V("X")),
             atom("level", V("X"), String(level))),
    )

/**
 * Derives `reachable_from(B)` for every node reachable from `source_id`.
 *
 *   reachable_from(B) :- reachable(source_id, B)
 * (combined with the reachability rules)
 */
export const connected_to_program = (
    source_id: string,
    strategy: ExecutionStrategy = "semi-naive"
): LogicProgram =>
    program(strategy,
        // reachability base
        rule(atom("flows_to",  V("A"), V("B")),
             atom("reads",  V("P"), V("A")),
             atom("writes", V("P"), V("B"))),
        rule(atom("reachable", V("A"), V("B")),
             atom("flows_to", V("A"), V("B"))),
        rule(atom("reachable", V("A"), V("C")),
             atom("reachable", V("A"), V("B")),
             atom("flows_to",  V("B"), V("C"))),
        // filter to source
        rule(atom("reachable_from", V("B")),
             atom("reachable", source_id, V("B"))),
    )

/**
 * Compose two programs: combine their rules into one program.
 * Useful for building more complex topology queries from smaller pieces.
 */
export const compose_programs = (
    a: LogicProgram,
    b: LogicProgram,
    strategy?: ExecutionStrategy
): LogicProgram => ({
    rules: [...a.rules, ...b.rules],
    strategy: strategy ?? a.strategy,
})

// ─── Convenience: full topology derivation ────────────────────────────────────

/**
 * Convenience: given a topology fact cell, build a derived cell holding
 * `flows_to` and `reachable` facts for the full network.
 */
export const construct_reachability_cell = (
    topo_cell: Cell<FactSet>,
    strategy: ExecutionStrategy = "semi-naive"
): Cell<FactSet> =>
    run_program(topology_reachability_program(strategy), [topo_cell], "reachability")

/**
 * Convenience: derive a cell holding `ns_match(X)` facts for nodes in `prefix`.
 */
export const construct_namespace_filter_cell = (
    topo_cell: Cell<FactSet>,
    prefix: string,
    strategy: ExecutionStrategy = "semi-naive"
): Cell<FactSet> =>
    run_program(cell_namespace_program(prefix, strategy), [topo_cell], `ns_${prefix.replace(/\W/g, "_")}`)

/**
 * Convenience: derive a cell holding `kind_match(X)` facts for nodes of `kind`.
 */
export const construct_kind_filter_cell = (
    topo_cell: Cell<FactSet>,
    kind: "cell" | "prop",
    strategy: ExecutionStrategy = "semi-naive"
): Cell<FactSet> =>
    run_program(cell_kind_program(kind, strategy), [topo_cell], `kind_${kind}`)

/**
 * Convenience: derive a cell holding `level_match(X)` facts for nodes at `level`.
 */
export const construct_level_filter_cell = (
    topo_cell: Cell<FactSet>,
    level: number,
    strategy: ExecutionStrategy = "semi-naive"
): Cell<FactSet> =>
    run_program(cell_level_program(level, strategy), [topo_cell], `level_${level}`)
