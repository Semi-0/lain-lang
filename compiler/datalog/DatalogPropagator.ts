// SPDX-License-Identifier: GPL-3.0-or-later
//
// Copyright (c) 2024–2026 semi-0
//
// DatalogPropagator — wraps the semi-naive Datalog engine as a propagator.
//
// A FactSet cell holds a set of ground Datalog facts.  Merging two FactSet
// cells is *additive* (set-union), not substitutive — so the cell never
// contradicts when new facts arrive.  is_equal is extended to compare sets
// by unification-based equality so the scheduler knows when a re-derivation
// produced no new information.
//
// Usage:
//   install_datalog_handlers()   // once, before building any datalog propagators
//   const edges = construct_cell<FactSet>("edges")
//   const paths  = derive_facts([edges], path_rules, "paths")
//   update_cell(edges, make_fact_set([["edge","a","b"], ["edge","b","c"]]))
//   execute_all_tasks_sequential(() => {})
//   // paths now contains all derived path facts

import { semi_naive_datalog, query, type Fact, type Rule } from "pmatcher/new_match/MiniDatalog"
import { unify, type UnifyDict } from "pmatcher/new_match/Unification"
import { evaluate_program, type LogicProgram, type QueryDecl } from "./LogicProgram"
import {
    construct_propagator,
    type Propagator,
    type Cell,
    cell_strongest_base_value,
    add_cell_content as update_cell,
    construct_cell,
    generic_merge,
} from "ppropogator"
import { is_equal } from "generic-handler/built_in_generics/generic_arithmetic"
import { register_predicate, match_args } from "generic-handler/Predicates"
import { define_generic_procedure_handler } from "generic-handler/GenericProcedure"

// ─── FactSet type ─────────────────────────────────────────────────────────────

/** Tagged wrapper around a Datalog fact database.  The tag lets predicates
 *  distinguish a FactSet from an ordinary array without false positives. */
export type FactSet = { readonly type: "fact_set"; readonly facts: Fact[] }

export const make_fact_set = (facts: Fact[]): FactSet =>
    ({ type: "fact_set", facts })

export const is_fact_set = register_predicate(
    "is_fact_set",
    (x: any): x is FactSet =>
        x != null &&
        typeof x === "object" &&
        x.type === "fact_set" &&
        Array.isArray(x.facts)
)

// ─── Fact equality via unification ───────────────────────────────────────────

/** True when `facts` already contains something that unifies with `target`.
 *  For ground facts this is structural equality; for pattern facts it is
 *  proper unification-based subsumption. */
const facts_contains = (facts: Fact[], target: Fact): boolean =>
    facts.some(f => unify(f, target) !== false)

// ─── Additive merge ───────────────────────────────────────────────────────────

const merge_fact_sets = (a: FactSet, b: FactSet): FactSet =>
    make_fact_set([
        ...a.facts,
        ...b.facts.filter(f => !facts_contains(a.facts, f)),
    ])

const fact_sets_equal = (a: FactSet, b: FactSet): boolean =>
    a.facts.length === b.facts.length &&
    a.facts.every(fa => facts_contains(b.facts, fa))

// ─── Handler registration ─────────────────────────────────────────────────────

let _handlers_installed = false

/**
 * Register merge/equality handlers for FactSet on the generic procedures used
 * by the propagator cell machinery.  Safe to call multiple times.
 */
export const install_datalog_handlers = () => {
    if (_handlers_installed) return
    _handlers_installed = true

    // Additive merge: no contradiction when fact sets differ — just union them
    define_generic_procedure_handler(
        generic_merge,
        match_args(is_fact_set, is_fact_set),
        merge_fact_sets
    )

    // Two fact sets are equal when they contain the same facts, so re-derivation
    // that produces the same IDB does not re-alert downstream propagators
    define_generic_procedure_handler(
        is_equal,
        match_args(is_fact_set, is_fact_set),
        fact_sets_equal
    )
}

// ─── Datalog propagator ───────────────────────────────────────────────────────

/**
 * Construct a propagator that runs semi-naive Datalog evaluation.
 *
 * Whenever any cell in `edb_cells` updates, the propagator:
 *   1. Collects all facts from every EDB cell
 *   2. Runs `semi_naive_datalog(rules, edb)` to compute the least fixpoint
 *   3. Writes the full derived fact set (EDB ∪ IDB) to `output`
 *
 * Because FactSet merges are additive, `output` accumulates knowledge over
 * time — facts are never retracted.  This matches Datalog's monotone semantics.
 */
export const construct_datalog_propagator = (
    edb_cells: Cell<FactSet>[],
    rules: Rule[],
    output: Cell<FactSet>,
    name = "datalog"
): Propagator =>
    construct_propagator(
        edb_cells,
        [output],
        () => {
            const edb: Fact[] = []
            for (const cell of edb_cells) {
                const val = cell_strongest_base_value(cell)
                if (is_fact_set(val)) edb.push(...val.facts)
            }
            update_cell(output, make_fact_set(semi_naive_datalog(rules, edb)))
        },
        name
    )

/**
 * Convenience: allocate an output cell and wire a Datalog propagator to it.
 *
 * @param edb_cells  Input cells whose FactSet values form the EDB.
 * @param rules      Datalog rules to apply.
 * @param name       Base name for the output cell.
 * @returns          The output cell (Cell<FactSet>) containing EDB ∪ IDB.
 */
export const derive_facts = (
    edb_cells: Cell<FactSet>[],
    rules: Rule[],
    name = "derived"
): Cell<FactSet> => {
    const output = construct_cell<FactSet>(name)
    construct_datalog_propagator(edb_cells, rules, output, name + "_prop")
    return output
}

/**
 * Query the FactSet held in `cell` using a pattern atom.
 * Variables in `pattern` are created with `V()` from MiniDatalog.
 *
 * @returns Array of variable-binding maps for every matching fact.
 */
export const query_fact_cell = (
    cell: Cell<FactSet>,
    pattern: any[]
): UnifyDict[] => {
    const val = cell_strongest_base_value(cell)
    if (!is_fact_set(val)) return []
    return query(pattern, val.facts)
}

// ─── LogicProgram execution ───────────────────────────────────────────────────

/**
 * Wire a declared LogicProgram to EDB cells and produce a derived output cell.
 *
 * Declaration and execution are separate: `prog` is pure data; the propagator
 * created here chooses the engine (naive / semi-naive) based on `prog.strategy`
 * and whether any extended atoms (BuiltinPred) are present.
 *
 * @param prog       A LogicProgram declaration (from `program()`).
 * @param edb_cells  Input cells whose FactSet values form the extensional DB.
 * @param name       Base name for the output cell.
 */
export const run_program = (
    prog: LogicProgram,
    edb_cells: Cell<FactSet>[],
    name = "derived"
): Cell<FactSet> => {
    const output = construct_cell<FactSet>(name)
    construct_propagator(
        edb_cells,
        [output],
        () => {
            const edb: Fact[] = []
            for (const cell of edb_cells) {
                const val = cell_strongest_base_value(cell)
                if (is_fact_set(val)) edb.push(...val.facts)
            }
            update_cell(output, make_fact_set(evaluate_program(prog, edb)))
        },
        name + "_exec"
    )
    return output
}

/**
 * Wire a QueryDecl to EDB cells: derives the IDB and provides a lazy read.
 *
 * Returns:
 *   - `derived`: Cell<FactSet> with EDB ∪ IDB (for inspection / chaining)
 *   - `read`:    () => UnifyDict[]  — synchronously query the derived cell
 *                                     with the declared pattern
 *
 * Pattern-match results are intentionally NOT stored in a cell because
 * UnifyDict[] has no defined merge semantics.  Call `read()` after
 * execute_all_tasks_sequential() to get current results.
 *
 * @param decl       A QueryDecl (from `query_decl(pattern, program)`).
 * @param edb_cells  Input EDB cells.
 * @param name       Base name for the derived cell.
 */
export const run_query = (
    decl: QueryDecl,
    edb_cells: Cell<FactSet>[],
    name = "query"
): { derived: Cell<FactSet>; read: () => UnifyDict[] } => {
    const derived = run_program(decl.program, edb_cells, name + "_derived")
    return {
        derived,
        read: () => query_fact_cell(derived, decl.pattern),
    }
}
