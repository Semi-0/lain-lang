// SPDX-License-Identifier: GPL-3.0-or-later
//
// Copyright (c) 2024–2026 semi-0
//
// TracedGraphDatalog — materialize Graphology trace graphs (generalized_tracer
// + graph_combinators) as Datalog facts and run LogicPrograms through the
// existing FactSet / propagator stack.
//
// Coverage vs docs/reference/propagation-tracing.md–style queries (graph_combinators_card):
//   Q1 namespace / intersect(kind, namespace)     — fully via datalog on this EDB
//   Q3 kind / level filters                       — fully via datalog
//   Q4 union / intersect of node sets (two traces)— fully via trace_mem facts + rules
//   Q5 value on nodes                             — g_value facts; match attrs in TS
//   Q2 collapse_accessor_paths                  — not expressible as Horn rules;
//                                                 apply collapse in TS, then materialize facts
//   Q6 annotate_cell_content                    — live cells only; TS combinator, not EDB
//
// Existing modules are imported only; this file is additive.

import type { DirectedGraph } from "graphology"
import { subgraph } from "graphology-operators"
import type { Cell } from "ppropogator"
import { construct_cell, update_cell } from "ppropogator/Cell/Cell"
import { execute_all_tasks_sequential } from "ppropogator/Shared/Scheduler/Scheduler"
import type { Fact } from "pmatcher/new_match/MiniDatalog"
import {
    install_datalog_handlers,
    make_fact_set,
    run_program,
    type FactSet,
} from "./DatalogPropagator"
import {
    V,
    atom,
    rule,
    program,
    StartsWith,
    type LogicProgram,
    type ExecutionStrategy,
    evaluate_program,
} from "./LogicProgram"

// ─── EDB schema (traced Graphology graph) ────────────────────────────────────
//
//   ["g_node", id]
//   ["g_edge", src, dst]
//   ["g_kind", id, "cell" | "propagator"]
//   ["g_namespace", id, ns]     — only when attrs.namespace is a string
//   ["g_level", id, levelStr]    — only when attrs.relationLevel is a number
//   ["g_label", id, labelStr]
//   ["g_value", id, valueStr]    — when attrs.value is present (stringified)
//
// Two-trace membership (Q4), not from traced_graph_to_facts:
//   ["trace_mem", "up" | "down", nodeId]

/** Serialize a traced propagator graph into extensional facts. */
export const traced_graph_to_facts = (graph: DirectedGraph): Fact[] => {
    const facts: Fact[] = []

    graph.forEachNode((id, attrs) => {
        const a = attrs as Record<string, unknown>
        facts.push(["g_node", id])
        if (a.kind === "cell" || a.kind === "propagator") {
            facts.push(["g_kind", id, a.kind])
        }
        if (typeof a.namespace === "string") {
            facts.push(["g_namespace", id, a.namespace])
        }
        if (typeof a.relationLevel === "number") {
            facts.push(["g_level", id, String(a.relationLevel)])
        }
        const label = a.label
        if (label !== undefined && label !== null) {
            facts.push(["g_label", id, String(label)])
        }
        if (a.value !== undefined && a.value !== null) {
            facts.push(["g_value", id, String(a.value)])
        }
    })

    graph.forEachEdge((_, _attrs, source, target) => {
        facts.push(["g_edge", String(source), String(target)])
    })

    return facts
}

/** EDB facts for union/intersect of two traced graphs’ node sets (Q4). */
export const trace_pair_membership_facts = (
    up: DirectedGraph,
    down: DirectedGraph
): Fact[] => {
    const facts: Fact[] = []
    for (const id of up.nodes()) facts.push(["trace_mem", "up", id])
    for (const id of down.nodes()) facts.push(["trace_mem", "down", id])
    return facts
}

// ─── Derived programs (declarative, same style as TopologyFacts) ─────────────

/**
 * ns_match(N) :- g_namespace(N, NS), NS starts with prefix
 * (mirrors card Q1 subgraph_by_namespace)
 */
export const traced_namespace_program = (
    prefix: string,
    strategy: ExecutionStrategy = "semi-naive"
): LogicProgram =>
    program(
        strategy,
        rule(
            atom("ns_match", V("N")),
            atom("g_namespace", V("N"), V("NS")),
            StartsWith(V("NS"), prefix)
        )
    )

/**
 * card_cell(N) :- g_kind(N, "cell"), g_namespace(N, NS), NS starts with "::"
 * (mirrors Q1 intersect namespace + kind cell on slot namespaces)
 */
export const traced_card_slot_cell_program = (
    strategy: ExecutionStrategy = "semi-naive"
): LogicProgram =>
    program(
        strategy,
        rule(
            atom("card_cell", V("N")),
            atom("g_kind", V("N"), "cell"),
            atom("g_namespace", V("N"), V("NS")),
            StartsWith(V("NS"), "::")
        )
    )

/** kind_match(N) :- g_kind(N, kind) */
export const traced_kind_program = (
    kind: "cell" | "propagator",
    strategy: ExecutionStrategy = "semi-naive"
): LogicProgram =>
    program(strategy, rule(atom("kind_match", V("N")), atom("g_kind", V("N"), kind)))

/** level_match(N) :- g_level(N, levelStr) */
export const traced_level_program = (
    level: number,
    strategy: ExecutionStrategy = "semi-naive"
): LogicProgram =>
    program(
        strategy,
        rule(atom("level_match", V("N")), atom("g_level", V("N"), String(level)))
    )

/**
 * level_cell(N) :- g_kind(N, "cell"), g_level(N, levelStr)
 * Matches Q3-style filter on a cell subgraph (same relation level on cells only).
 */
export const traced_cell_at_level_program = (
    level: number,
    strategy: ExecutionStrategy = "semi-naive"
): LogicProgram =>
    program(
        strategy,
        rule(
            atom("level_cell", V("N")),
            atom("g_kind", V("N"), "cell"),
            atom("g_level", V("N"), String(level))
        )
    )

/**
 * union_node(N) from either trace; both_node(N) in both (Q4 node sets).
 * Pair with trace_pair_membership_edb / facts.
 */
export const traced_trace_pair_program = (
    strategy: ExecutionStrategy = "semi-naive"
): LogicProgram =>
    program(
        strategy,
        rule(atom("union_node", V("N")), atom("trace_mem", "up", V("N"))),
        rule(atom("union_node", V("N")), atom("trace_mem", "down", V("N"))),
        rule(
            atom("both_node", V("N")),
            atom("trace_mem", "up", V("N")),
            atom("trace_mem", "down", V("N"))
        )
    )

// ─── Query helpers ───────────────────────────────────────────────────────────

/** Unary derived predicates: collect the first argument after the predicate name. */
export const node_ids_from_facts = (facts: Fact[], predicate: string): Set<string> => {
    const out = new Set<string>()
    for (const f of facts) {
        if (f.length >= 2 && f[0] === predicate && typeof f[1] === "string") {
            out.add(f[1])
        }
    }
    return out
}

/** Induced subgraph on a node id set (edges preserved when both endpoints kept). */
export const induced_subgraph_from_ids = (
    graph: DirectedGraph,
    keep: Set<string>
): DirectedGraph => subgraph(graph, (id) => keep.has(id)) as DirectedGraph

/** Synchronous fixpoint evaluation for tests and one-shot tools. */
export const evaluate_traced_program = (
    graph: DirectedGraph,
    prog: LogicProgram
): Fact[] => evaluate_program(prog, traced_graph_to_facts(graph))

export const evaluate_trace_pair_program = (
    up: DirectedGraph,
    down: DirectedGraph,
    prog: LogicProgram
): Fact[] => evaluate_program(prog, trace_pair_membership_facts(up, down))

// ─── Propagator wiring ───────────────────────────────────────────────────────

/**
 * Allocate an EDB cell, install datalog handlers, push a FactSet for `graph`,
 * and return `{ edb, derived }` where `derived` is the output of run_program.
 * Runs the scheduler once so `derived` is populated.
 */
export const wire_traced_graph_datalog = (
    graph: DirectedGraph,
    prog: LogicProgram,
    name = "traced_datalog"
): { edb: Cell<FactSet>; derived: Cell<FactSet> } => {
    install_datalog_handlers()
    const edb = construct_cell<FactSet>(`${name}_edb`)
    const derived = run_program(prog, [edb], `${name}_derived`)
    update_cell(edb, make_fact_set(traced_graph_to_facts(graph)))
    execute_all_tasks_sequential(() => {})
    return { edb, derived }
}
