// SPDX-License-Identifier: GPL-3.0-or-later
//
// Copyright (c) 2024–2026 semi-0
//
// Datalog / kiroshi stdlib primitives — reactive and batch Datalog query language.
//
// Together these six primitives form a complete composable query language inside
// the propagator DSL:
//
//   datalog:assert          raw Fact[] cell → Cell<FactSet>
//   datalog:derive          batch semi-naive derivation: edb × rules → derived
//   datalog:union           merge two FactSet cells into one
//   datalog:query           pattern-match a FactSet, output ground matching facts
//   datalog:reactive:derive incremental (kiroshi) derivation: edb × rules → derived
//   datalog:reactive:topology trigger → topology flows_to / reachable FactSet
//
// Typical wiring in the lain DSL:
//
//   (datalog:assert  raw_facts                edb)
//   (datalog:derive  edb         rules        derived)
//   (datalog:query   derived     path_pattern results)
//   (datalog:union   derived_a   derived_b    merged)
//
//   (datalog:reactive:derive   edb rules incremental_out)
//   (datalog:reactive:topology trigger topo_out)

import type { Cell } from "ppropogator/Cell/Cell"
import { DirectedGraph } from "graphology"
import {
    construct_propagator,
    cell_strongest_base_value,
    add_cell_content as update_cell,
    is_nothing,
    is_contradiction,
    cell_id,
} from "ppropogator"
import { semi_naive_datalog, query, type Rule } from "pmatcher/new_match/MiniDatalog"
import type { Fact } from "pmatcher/new_match/MiniDatalog"
import { match_dict_substitute } from "pmatcher/new_match/Unification"
import {
    make_fact_set,
    is_fact_set,
    type FactSet,
} from "../../datalog/DatalogPropagator"
import {
    derive_facts_kiroshi,
    construct_kiroshi_topology_propagator,
} from "../../datalog/KiroshiPropagator"
import { snapshot_topology_facts } from "../../datalog/TopologyFacts"
import {
    graphology_from_topology_facts,
    resolve_network_ids,
} from "../../datalog/NetworkTopologyGraphology"
import type { LogicProgram } from "../../datalog/LogicProgram"
import type { SpecialPrimitiveSpec } from "./types"
import { update_specialized_reactive_value } from "../../../src/grpc/better_runtime"

// ─── p_datalog_assert ─────────────────────────────────────────────────────────
//
// Pipes a Cell<FactSet> into an output Cell<FactSet>.  Useful for explicitly
// naming or isolating a fact source in the DSL before wiring it through
// datalog:union or datalog:derive:
//
//   (datalog:assert source_facts edb)
//
// IMPORTANT: source must hold a FactSet (created with make_fact_set).
// Do NOT pass a raw Fact[] cell — plain arrays have no stable merge semantics
// in the TemporaryValueSet system across init_system() calls.

export const p_datalog_assert = (
    source: Cell<FactSet>,
    output: Cell<FactSet>,
) => {
    return construct_propagator(
        [source as Cell<any>],
        [],
        () => {
            const val = cell_strongest_base_value(source) as any
            if (!is_fact_set(val)) return
            update_cell(output, val as FactSet)
        },
        "datalog_assert"
    )
}

// ─── p_datalog_derive ─────────────────────────────────────────────────────────
//
// Batch semi-naive derivation.  Re-computes the full least-fixpoint on every
// update of either edb or rules.  Use this when the EDB is small and you do not
// need the O(delta · log N) incremental behaviour of kiroshi.
//
//   (datalog:derive edb rules derived)

export const p_datalog_derive = (
    edb_cell: Cell<FactSet>,
    rules_cell: Cell<Rule[] | LogicProgram>,
    output: Cell<FactSet>,
) => {
    return construct_propagator(
        [edb_cell, rules_cell],
        [],
        () => {
            const edb_val = cell_strongest_base_value(edb_cell) as any
            const rules_val = cell_strongest_base_value(rules_cell) as any
            if (!is_fact_set(edb_val) || is_nothing(rules_val) || is_contradiction(rules_val) || rules_val == null) return

            const rules: Rule[] = Array.isArray(rules_val)
                ? (rules_val as Rule[])
                : ((rules_val as LogicProgram).rules as Rule[])

            if (rules.length === 0) return

            const derived = semi_naive_datalog(rules, (edb_val as FactSet).facts)
            update_cell(output, make_fact_set(derived))
        },
        "datalog_derive"
    )
}

// ─── p_datalog_union ──────────────────────────────────────────────────────────
//
// Merge two FactSet cells into one.  Useful when you have multiple independent
// EDB sources that you want to run a single rule set against:
//
//   (datalog:union edb_a edb_b combined_edb)
//   (datalog:derive combined_edb rules derived)

export const p_datalog_union = (
    a: Cell<FactSet>,
    b: Cell<FactSet>,
    output: Cell<FactSet>,
) => {
    return construct_propagator(
        [a, b],
        [],
        () => {
            const av = cell_strongest_base_value(a) as any
            const bv = cell_strongest_base_value(b) as any
            const a_facts: Fact[] = is_fact_set(av) ? (av as FactSet).facts : []
            const b_facts: Fact[] = is_fact_set(bv) ? (bv as FactSet).facts : []
            if (a_facts.length === 0 && b_facts.length === 0) return

            const seen = new Set(a_facts.map(f => JSON.stringify(f)))
            const merged: Fact[] = [...a_facts]
            for (const f of b_facts) {
                const key = JSON.stringify(f)
                if (!seen.has(key)) { seen.add(key); merged.push(f) }
            }
            update_cell(output, make_fact_set(merged))
        },
        "datalog_union"
    )
}

// ─── QueryPattern ─────────────────────────────────────────────────────────────
//
// A tagged wrapper around a Datalog pattern array.  Plain JS arrays CANNOT be
// stored directly in a propagator cell because the GenericValueSet system
// (DataTypes/GenericValueSet.ts) treats every array as a concurrent value-set,
// causing merge errors and marking the cell as unusable.
//
// Always create patterns via make_query_pattern and read them with
// is_query_pattern / unwrap_query_pattern inside propagator handlers.

export type QueryPattern = { readonly type: "QueryPattern"; readonly pattern: Fact[] }

export const make_query_pattern = (pattern: Fact[]): QueryPattern =>
    ({ type: "QueryPattern", pattern })

export const is_query_pattern = (x: any): x is QueryPattern =>
    x != null && x.type === "QueryPattern" && Array.isArray(x.pattern)

// ─── p_datalog_query ──────────────────────────────────────────────────────────
//
// Pattern-match a FactSet with a template atom held in a cell.  The template
// may contain MiniDatalog variables (V("X")), constants, or mixed.  Each time
// either derived or pattern updates, all ground facts that unify with the
// pattern are written to results as a new FactSet:
//
//   (datalog:query derived path_pattern results)
//
// IMPORTANT: `path_pattern` must hold a QueryPattern value (created via
// make_query_pattern) — NOT a raw array.  Raw arrays are treated as concurrent
// value-sets by the propagator system and will be flagged as unusable.
//
// `results` will contain the ground facts: [["path","a","b"], ["path","a","c"], …]

export const p_datalog_query = (
    derived: Cell<FactSet>,
    pattern: Cell<QueryPattern>,
    results: Cell<FactSet>,
) => {
    return construct_propagator(
        [derived, pattern],
        [],
        () => {
            const facts_val = cell_strongest_base_value(derived) as any
            const pattern_val = cell_strongest_base_value(pattern) as any
            if (!is_fact_set(facts_val) || !is_query_pattern(pattern_val)) return

            const pat = pattern_val.pattern
            const bindings = query(pat, (facts_val as FactSet).facts)
            if (bindings.length === 0) return

            // Substitute each binding back into the pattern to get ground facts
            const matched_facts: Fact[] = bindings.map(
                dict => match_dict_substitute(dict)(pat) as Fact
            )
            update_cell(results, make_fact_set(matched_facts))
        },
        "datalog_query"
    )
}

// ─── p_kiroshi_derive ─────────────────────────────────────────────────────────
//
// Incremental derivation backed by the kiroshi trie engine.
// Where p_datalog_derive re-runs the full fixpoint on each update (O(N²)),
// this propagator only routes new delta facts through the engine (O(delta · log N)).
//
//   (datalog:reactive:derive edb rules incremental_derived)

export const p_kiroshi_derive = (
    edb_cell: Cell<FactSet>,
    rules_cell: Cell<Rule[] | LogicProgram>,
    output: Cell<FactSet>,
) => {
    let wired = false
    let derived_cell: Cell<FactSet> | null = null

    return construct_propagator(
        [edb_cell, rules_cell],
        [],
        () => {
            if (!wired) {
                const rules_val = cell_strongest_base_value(rules_cell)
                if (is_nothing(rules_val) || is_contradiction(rules_val) || rules_val == null) return

                const rules: Rule[] = Array.isArray(rules_val)
                    ? (rules_val as Rule[])
                    : ((rules_val as LogicProgram).rules as Rule[])

                if (rules.length === 0) return
                wired = true

                derived_cell = derive_facts_kiroshi([edb_cell], rules, "kiroshi_prim")
                construct_propagator(
                    [derived_cell as Cell<any>],
                    [],
                    () => {
                        const val = cell_strongest_base_value(derived_cell!) as any
                        if (is_fact_set(val)) update_cell(output, val as FactSet)
                    },
                    "kiroshi_prim_forward"
                )
            }
        },
        "kiroshi_derive_setup"
    )
}

// ─── p_kiroshi_topology ───────────────────────────────────────────────────────
//
// Reactive topology reachability: whenever `trigger` updates, snapshot the live
// propagator network and run the standard reachability rules to produce
// `flows_to` and `reachable` facts.
//
//   (datalog:reactive:topology trigger topo_out)

export const p_kiroshi_topology = (
    trigger: Cell<any>,
    output: Cell<FactSet>,
) => {
    let topo_cell: Cell<FactSet> | null = null

    return construct_propagator(
        [trigger],
        [],
        () => {
            if (!topo_cell) {
                const derived = construct_kiroshi_topology_propagator(trigger, "kiroshi_topo_prim")
                topo_cell = derived
                construct_propagator(
                    [topo_cell as Cell<any>],
                    [],
                    () => {
                        const val = cell_strongest_base_value(topo_cell!) as any
                        if (is_fact_set(val)) update_cell(output, val as FactSet)
                    },
                    "kiroshi_topo_forward"
                )
            }
        },
        "kiroshi_topology_setup"
    )
}

// ─── p_kiroshi_trace_propagator_io ────────────────────────────────────────────
//
// High-level topology tracer for one designated propagator name.
// On each trigger, snapshot topology facts, project the designated propagator's
// direct read/write neighborhood, resolve ids back to live entities, then emit
// the induced Graphology graph.
//
//   (datalog:reactive:trace-io "+" trigger traced_graph)
const trace_ids_from_topology_facts = (
    facts: Fact[],
    propagator_name: string,
): Set<string> => {
    const out = new Set<string>()
    const target_props = new Set<string>()

    for (const f of facts) {
        if (
            f[0] === "propagator" &&
            typeof f[1] === "string" &&
            typeof f[2] === "string" &&
            f[2] === propagator_name
        ) {
            target_props.add(f[1])
            out.add(f[1])
        }
    }

    for (const f of facts) {
        if (
            f[0] === "reads" &&
            typeof f[1] === "string" &&
            typeof f[2] === "string" &&
            target_props.has(f[1])
        ) {
            out.add(f[2])
        }
        if (
            f[0] === "writes" &&
            typeof f[1] === "string" &&
            typeof f[2] === "string" &&
            target_props.has(f[1])
        ) {
            out.add(f[2])
        }
    }

    return out
}

export const p_kiroshi_trace_propagator_io = (
    designated_propagator: Cell<string>,
    trigger: Cell<any>,
    output: Cell<DirectedGraph>,
) => {
    return construct_propagator(
        [designated_propagator, trigger],
        [output],
        () => {
            const target = cell_strongest_base_value(designated_propagator)
            if (typeof target !== "string" || target.length === 0) return
            console.log("tracing propagator", target)

            // this is very unefficient, but we will deal with that later
            const facts = snapshot_topology_facts()
            const traced_ids = trace_ids_from_topology_facts(facts, target)
            console.log("traced ids", traced_ids)
            const resolved = resolve_network_ids(traced_ids)
            console.log("resolved", resolved)
            const keep = new Set(
                [...traced_ids].filter(id => !resolved.unresolved.includes(id))
            )
            const graph =
                keep.size === 0
                    ? new DirectedGraph()
                    : graphology_from_topology_facts(facts, keep)
            console.log("graph", graph)
            update_specialized_reactive_value(output, cell_id(output), graph)
            // update_cell(output, graph)
        },
        "kiroshi_trace_io_setup"
    )
}

// ─── Primitive spec table ─────────────────────────────────────────────────────
//
// Note: `p_datalog_assert` is intentionally omitted.  Raw Fact[] arrays have no
// safe merge semantics in the TemporaryValueSet system (the TVS merge-handler
// flags are module-level and do not survive `init_system()` resets in tests or
// runtime restarts).  In user code, create a FactSet cell with
// `make_fact_set([...])` and call `add_cell_content(edb_cell, factSet)` directly.

export const datalog_special_primitive_specs: readonly SpecialPrimitiveSpec[] = [
    { key: "datalog:derive",             inputs: 2, outputs: 1, constructor: p_datalog_derive },
    { key: "datalog:union",              inputs: 2, outputs: 1, constructor: p_datalog_union },
    { key: "datalog:query",              inputs: 2, outputs: 1, constructor: p_datalog_query },
    { key: "datalog:reactive:derive",    inputs: 2, outputs: 1, constructor: p_kiroshi_derive },
    { key: "datalog:reactive:topology",  inputs: 1, outputs: 1, constructor: p_kiroshi_topology },
    { key: "datalog:reactive:trace-io",  inputs: 2, outputs: 1, constructor: p_kiroshi_trace_propagator_io },
]
