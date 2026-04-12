// SPDX-License-Identifier: GPL-3.0-or-later
//
// Copyright (c) 2024–2026 semi-0
//
// KiroshiPropagator — incremental reactive Datalog via the kiroshi trie engine.
//
// Drop-in companion to DatalogPropagator.  Where DatalogPropagator re-runs
// semi_naive_datalog from scratch on every EDB update (O(N²) per trigger),
// this module routes new facts only through the kiroshi trie engine, which
// processes each delta in O(delta · log N) and skips already-known derivations.
//
// ── Relationship to the existing stack ────────────────────────────────────────
//
//   DatalogPropagator    — batch, FactSet, re-evaluates from scratch
//   KiroshiPropagator    — incremental, also FactSet-compatible, kiroshi engine
//
//   Both produce Cell<FactSet> outputs so downstream consumers are unchanged.
//   The LogicProgram / Rule[] format (from LogicProgram.ts) is accepted directly.
//
// ── Wiring model ──────────────────────────────────────────────────────────────
//
//   EDB Cell<FactSet>(s)
//       │  (bridge propagator)
//       ▼  extracts new facts per-predicate, asserts into kiroshi FactStores
//   kiroshi reactive engine (one DualTrie + rule propagator per rule)
//       │  (output forwarding propagators, one per IDB predicate)
//       ▼  wraps derived Fact[] back into FactSet
//   output Cell<FactSet>
//
// ── Usage ─────────────────────────────────────────────────────────────────────
//
//   const edb  = construct_cell<FactSet>("edges")
//   const out  = derive_facts_kiroshi([edb], tc_rules, "paths")
//   update_cell(edb, make_fact_set([["edge","a","b"], ["edge","b","c"]]))
//   execute_all_tasks_sequential(() => {})
//   // out now holds path(a,b), path(b,c), path(a,c)

import {
    construct_propagator,
    type Cell,
    cell_strongest_base_value,
    construct_cell,
    add_cell_content as update_cell,
} from "ppropogator"
import { generic_merge } from "ppropogator/Cell/Merge"
import { merge_temporary_value_set } from "ppropogator/DataTypes/TemporaryValueSet"
import { define_generic_procedure_handler } from "generic-handler/GenericProcedure"
import { match_args, register_predicate } from "generic-handler/Predicates"
import { is_nothing } from "ppropogator/Cell/CellValue"
import type { Rule, Fact } from "pmatcher/new_match/MiniDatalog"
import {
    reactive_datalog_trie,
    assert_fact,
    get_facts,
    make_fact_store,
} from "kiroshi"
import {
    install_datalog_handlers,
    make_fact_set,
    is_fact_set,
    type FactSet,
} from "./DatalogPropagator"

// ─── Fact[] merge handler registration ───────────────────────────────────────
//
// After init_system() in lain-lang, cell_merge is replaced by
// merge_temporary_value_set.  That function's default branch falls to
// merge_layered (sando) for plain arrays, which corrupts kiroshi's Fact[]
// cells by treating them as LayeredObjects.
//
// We register handlers for is_fact_array × is_fact_array (and
// is_nothing × is_fact_array) on both generic_merge and
// merge_temporary_value_set so that kiroshi stores always receive a
// deduplicated Fact[] instead of a corrupted LayeredObject.

const is_fact_array = register_predicate(
    "is_fact_array",
    (x: any): x is Fact[] =>
        Array.isArray(x) &&
        (x.length === 0 ||
            (Array.isArray(x[0]) && typeof x[0][0] === "string"))
)

const fact_array_merge = (content: Fact[], increment: Fact[]): Fact[] => {
    const seen = new Set(content.map(f => JSON.stringify(f)))
    const result: Fact[] = [...content]
    for (const item of increment) {
        const key = JSON.stringify(item)
        if (!seen.has(key)) { seen.add(key); result.push(item) }
    }
    return result
}

let _kiroshi_merge_installed = false

export const install_kiroshi_merge_handlers = (): void => {
    if (_kiroshi_merge_installed) return
    _kiroshi_merge_installed = true

    // generic_merge: used before init_system() and inside TVS fallthrough
    define_generic_procedure_handler(
        generic_merge,
        match_args(is_fact_array, is_fact_array),
        fact_array_merge
    )
    define_generic_procedure_handler(
        generic_merge,
        match_args(is_nothing, is_fact_array),
        (_: any, inc: Fact[]) => inc
    )

    // merge_temporary_value_set: the active cell_merge after init_system()
    define_generic_procedure_handler(
        merge_temporary_value_set,
        match_args(is_fact_array, is_fact_array),
        fact_array_merge
    )
    define_generic_procedure_handler(
        merge_temporary_value_set,
        match_args(is_nothing, is_fact_array),
        (_: any, inc: Fact[]) => inc
    )
}
import {
    snapshot_topology_facts,
    topology_reachability_program,
} from "./TopologyFacts"
import type { LogicProgram } from "./LogicProgram"

// ─── Internal helpers ─────────────────────────────────────────────────────────

/** Collect the IDB (head) predicate names from a rule set. */
const idb_predicates = (rules: Rule[]): Set<string> =>
    new Set(rules.map(r => r.head[0] as string))

// ─── Core propagator ──────────────────────────────────────────────────────────

/**
 * Create an incremental Datalog propagator backed by the kiroshi trie engine.
 *
 * @param edb_cells  Input cells whose FactSet content forms the extensional DB.
 * @param rules      Datalog rules (standard Rule[] from MiniDatalog / LogicProgram).
 * @param output     Cell<FactSet> that receives derived (IDB) facts incrementally.
 * @param name       Label for the propagators created internally.
 */
export const construct_kiroshi_propagator = (
    edb_cells: Cell<FactSet>[],
    rules: Rule[],
    output: Cell<FactSet>,
    name = "kiroshi"
): void => {
    install_datalog_handlers()
    install_kiroshi_merge_handlers()

    const engine   = reactive_datalog_trie(rules)
    const idb_preds = idb_predicates(rules)

    // ── Output forwarding ──────────────────────────────────────────────────────
    // For each IDB predicate, watch the kiroshi store and forward to output.
    // This fires after the kiroshi rule propagators have run — the scheduler
    // cascades bridge → kiroshi engine → output in one execute_all_tasks call.
    for (const pred of idb_preds) {
        // ensure the store exists even before the first fact arrives
        if (!engine.has(pred)) engine.set(pred, make_fact_store(pred))
        const idb_store = engine.get(pred)!
        construct_propagator(
            [idb_store],
            [],
            () => {
                const facts = get_facts(pred, engine)
                if (facts.length > 0) update_cell(output, make_fact_set(facts))
            },
            `${name}_out:${pred}`
        )
    }

    // ── EDB bridge ────────────────────────────────────────────────────────────
    // Track how many facts from each EDB cell have been processed so far,
    // so we only assert the delta on each trigger (monotone EDB assumption).
    const seen_counts = edb_cells.map(() => 0)

    construct_propagator(
        edb_cells,
        [],
        () => {
            for (let i = 0; i < edb_cells.length; i++) {
                const val = cell_strongest_base_value(edb_cells[i]!)
                if (!is_fact_set(val)) continue

                const new_facts = val.facts.slice(seen_counts[i])
                seen_counts[i] = val.facts.length

                for (const fact of new_facts) {
                    assert_fact(fact, engine)
                }
            }
        },
        `${name}_bridge`
    )
}

/**
 * Convenience: allocate an output cell, wire the kiroshi propagator, return output.
 */
export const derive_facts_kiroshi = (
    edb_cells: Cell<FactSet>[],
    rules: Rule[],
    name = "kiroshi_derived"
): Cell<FactSet> => {
    install_datalog_handlers()
    const output = construct_cell<FactSet>(name)
    construct_kiroshi_propagator(edb_cells, rules, output, name)
    return output
}

// ─── LogicProgram compatibility ───────────────────────────────────────────────

/**
 * Like `derive_facts_kiroshi` but accepts a `LogicProgram` declaration.
 * Only standard Rule[] bodies are supported; BuiltinPred / NegFact extensions
 * require the extended naive evaluator in DatalogPropagator.ts.
 */
export const derive_program_kiroshi = (
    edb_cells: Cell<FactSet>[],
    prog: LogicProgram,
    name = "kiroshi_prog"
): Cell<FactSet> =>
    derive_facts_kiroshi(edb_cells, prog.rules as Rule[], name)

// ─── Topology variant ─────────────────────────────────────────────────────────

/**
 * When `trigger` updates, re-snapshot the live propagator topology and feed the
 * delta into a kiroshi engine running `topology_reachability_program` rules.
 *
 * Produces a Cell<FactSet> that holds `flows_to` and `reachable` facts,
 * updated incrementally after each trigger.
 *
 * @param trigger  Any cell — update it to cause a topology refresh.
 * @param name     Base name for internal cells/propagators.
 */
export const construct_kiroshi_topology_propagator = (
    trigger: Cell<any>,
    name = "kiroshi_topo"
): Cell<FactSet> => {
    install_datalog_handlers()

    const topo_cell = construct_cell<FactSet>(`${name}_facts`)
    const prog      = topology_reachability_program("semi-naive")
    const output    = derive_facts_kiroshi([topo_cell], prog.rules as Rule[], `${name}_derived`)

    // Re-snapshot topology into topo_cell whenever trigger fires
    construct_propagator(
        [trigger],
        [],
        () => update_cell(topo_cell, make_fact_set(snapshot_topology_facts())),
        `${name}_snapshot`
    )

    return output
}
