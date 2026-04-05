// SPDX-License-Identifier: GPL-3.0-or-later
//
// Copyright (c) 2024–2026 semi-0
//
// LogicProgram — declarative layer for composable logic programs.
//
// Separation of declaration from execution:
//   1. Declare a LogicProgram (pure data, no side effects, strategy is a hint)
//   2. Wire it to cells via run_program() or query_program() in DatalogPropagator
//   3. The engine (naive or semi-naive) is chosen at execution time
//
// Built-ins beyond standard MiniDatalog:
//   Pred(variable, fn)   — arbitrary JS predicate on a bound variable
//   StartsWith(var, str) — string prefix filter
//   Contains(var, str)   — string inclusion filter
//
// Re-exports everything needed for writing rules so callers only import this file.

import {
    V, Eq, Neq, Or, And,
    semi_naive_datalog, naive_datalog, query,
    type Rule, type Fact, type BodyAtom,
} from "pmatcher/new_match/MiniDatalog"
import {
    unify_internal,
    match_dict_substitute,
    empty_dict,
    type UnifyDict,
} from "pmatcher/new_match/Unification"
import { is_match_element, is_match_segment } from "pmatcher/MatchBuilder"

export { V, Eq, Neq, Or, And, type Fact, type BodyAtom, type Rule }
export { query }

// ─── Extended body atom: arbitrary JS predicate ──────────────────────────────

/** A body literal that tests a bound variable with an arbitrary JS function.
 *  The variable must be ground (already bound) by the time the resolver reaches
 *  this literal; if it is still unbound the clause fails (safe negation). */
export type BuiltinPred = { readonly pred: [any, (val: any) => boolean] }

export const Pred = (variable: any, fn: (val: any) => boolean): BuiltinPred =>
    ({ pred: [variable, fn] })

/** Succeeds when the bound value of `variable` starts with `prefix`. */
export const StartsWith = (variable: any, prefix: string): BuiltinPred =>
    Pred(variable, (s: any) => typeof s === "string" && s.startsWith(prefix))

/** Succeeds when the bound value of `variable` contains `substr`. */
export const Contains = (variable: any, substr: string): BuiltinPred =>
    Pred(variable, (s: any) => typeof s === "string" && s.includes(substr))

/** Succeeds when the bound value of `variable` equals `val` (===). */
export const Is = (variable: any, val: any): BuiltinPred =>
    Pred(variable, (s: any) => s === val)

export type ExtendedBodyAtom = BodyAtom | BuiltinPred

/** A rule that may use BuiltinPred body atoms in addition to standard Datalog atoms. */
export type ExtendedRule = { readonly head: any[]; readonly body: ExtendedBodyAtom[] }

// ─── Atom helper ──────────────────────────────────────────────────────────────

/** Build a predicate atom: `atom("edge", V("X"), V("Y"))` → `["edge", V("X"), V("Y")]`. */
export const atom = (pred: string, ...args: any[]): any[] => [pred, ...args]

// ─── Rule builder ─────────────────────────────────────────────────────────────

/** Declare a rule: `rule(atom("path", V("X"), V("Y")), atom("edge", V("X"), V("Y")))`. */
export const rule = (head: any[], ...body: ExtendedBodyAtom[]): ExtendedRule =>
    ({ head, body })

// ─── Strategy and program declaration ─────────────────────────────────────────

/** Execution strategy tag.  The engine is chosen at execution time in DatalogPropagator.
 *  "incremental" is reserved for future use. */
export type ExecutionStrategy = "semi-naive" | "naive" | "incremental"

export type LogicProgram = {
    readonly rules: ExtendedRule[]
    readonly strategy: ExecutionStrategy
}

/** Declare a logic program.  Pure data — no execution happens here.
 *  @param strategy Hint for the execution engine (default: "semi-naive").
 *  @param rules    One or more ExtendedRule declarations. */
export const program = (
    strategy: ExecutionStrategy = "semi-naive",
    ...rules: ExtendedRule[]
): LogicProgram => ({ rules, strategy })

// ─── Query declaration ────────────────────────────────────────────────────────

/** Declared query: a pattern atom + the program used to derive the fact base. */
export type QueryDecl = {
    readonly pattern: any[]
    readonly program: LogicProgram
}

/** Declare a query.  Pure data — no execution happens here.
 *  @param pattern A pattern atom whose variables will be bound by matches.
 *  @param prog    The LogicProgram that derives the fact base to query against. */
export const query_decl = (pattern: any[], prog: LogicProgram): QueryDecl =>
    ({ pattern, program: prog })

// ─── Internal resolver helpers ────────────────────────────────────────────────
//  Re-implemented here because MiniDatalog does not export its internals.

const is_ground = (x: any): boolean => {
    if (is_match_element(x) || is_match_segment(x)) return false
    if (Array.isArray(x)) return x.every(is_ground)
    return true
}

const ground_fact = (head: any[], dict: UnifyDict): Fact | false => {
    const result = match_dict_substitute(dict)(head)
    return is_ground(result) ? (result as Fact) : false
}

const unify_premise = (premise: any[], fact: Fact, dict: UnifyDict): UnifyDict | false => {
    const result = unify_internal(premise, fact, dict, (d: UnifyDict) => d)
    return result !== false && result !== undefined ? (result as UnifyDict) : false
}

const fact_equal = (a: Fact, b: Fact): boolean =>
    a.length === b.length && a.every((v, i) => v === b[i])

const add_if_new = (set: Fact[], fact: Fact): boolean => {
    if (set.some(f => fact_equal(f, fact))) return false
    set.push(fact)
    return true
}

// Type guards for standard MiniDatalog body atoms
const is_builtin_pred = (a: any): a is BuiltinPred =>
    a != null && typeof a === "object" && "pred" in a && !Array.isArray(a)

const is_eq = (a: any): boolean =>
    Array.isArray(a) && a.length === 3 && a[0] === "="

const is_neq = (a: any): boolean =>
    Array.isArray(a) && a.length === 3 && a[0] === "!="

const is_or = (a: any): boolean =>
    a != null && !Array.isArray(a) && typeof a === "object" && "or" in a

const is_and = (a: any): boolean =>
    a != null && !Array.isArray(a) && typeof a === "object" && "and" in a

// ─── Extended resolver ────────────────────────────────────────────────────────

/** Resolve body premises against `facts`, threading variable bindings.
 *  Handles all standard Datalog atoms plus BuiltinPred. */
const resolve_extended = (
    head: any[],
    premises: ExtendedBodyAtom[],
    facts: Fact[],
    dict: UnifyDict
): Fact[] => {
    if (premises.length === 0) {
        const f = ground_fact(head, dict)
        return f ? [f] : []
    }
    const [first, ...rest] = premises

    // BuiltinPred: test bound variable with JS predicate
    if (is_builtin_pred(first)) {
        const [variable, fn] = (first as BuiltinPred).pred
        const val = match_dict_substitute(dict)(variable)
        // Fail safely if variable is still unbound
        if (is_match_element(val) || is_match_segment(val)) return []
        if (!fn(val)) return []
        return resolve_extended(head, rest, facts, dict)
    }

    // Built-in equality (Eq)
    if (is_eq(first)) {
        const a = first as any[]
        const t1 = match_dict_substitute(dict)(a[1])
        const t2 = match_dict_substitute(dict)(a[2])
        const new_dict = unify_internal(t1, t2, dict, (d: UnifyDict) => d)
        if (new_dict !== false && new_dict !== undefined)
            return resolve_extended(head, rest, facts, new_dict as UnifyDict)
        return []
    }

    // Built-in inequality (Neq)
    if (is_neq(first)) {
        const a = first as any[]
        const t1 = match_dict_substitute(dict)(a[1])
        const t2 = match_dict_substitute(dict)(a[2])
        if (!is_ground(t1) || !is_ground(t2)) return []
        const eq = unify_internal(t1, t2, empty_dict(), (d: UnifyDict) => d)
        if (eq === false) return resolve_extended(head, rest, facts, dict)
        return []
    }

    // Disjunction (Or)
    if (is_or(first)) {
        const results: Fact[] = []
        for (const branch of (first as any).or)
            for (const f of resolve_extended(head, [...branch, ...rest], facts, dict))
                add_if_new(results, f)
        return results
    }

    // Conjunction (And) — flatten
    if (is_and(first)) {
        return resolve_extended(head, [...(first as any).and, ...rest], facts, dict)
    }

    // Regular database atom
    const results: Fact[] = []
    for (const fact of facts) {
        const new_dict = unify_premise(first as any[], fact, dict)
        if (new_dict !== false)
            results.push(...resolve_extended(head, rest, facts, new_dict))
    }
    return results
}

// ─── Evaluation engine ────────────────────────────────────────────────────────

/** True when any rule body contains at least one BuiltinPred. */
const has_extended_atoms = (rules: ExtendedRule[]): boolean =>
    rules.some(r => r.body.some(is_builtin_pred))

/** Naive bottom-up fixpoint for extended rules (handles BuiltinPred). */
const evaluate_extended_naive = (rules: ExtendedRule[], edb: Fact[]): Fact[] => {
    let all_facts = [...edb]

    const step = (): boolean => {
        let changed = false
        for (const r of rules) {
            const derived = resolve_extended(r.head, r.body, all_facts, empty_dict())
            for (const f of derived)
                if (add_if_new(all_facts, f)) changed = true
        }
        return changed
    }

    while (step()) { /* iterate to fixpoint */ }
    return all_facts
}

/**
 * Evaluate a LogicProgram against a set of EDB facts.
 *
 * Strategy is applied when possible:
 *   - "semi-naive": uses MiniDatalog's optimised implementation unless the
 *     program contains BuiltinPred atoms (which require the extended resolver).
 *   - "naive" or "incremental": always uses the extended naive fixpoint.
 *
 * Returns the full derived fact set (EDB ∪ IDB).
 */
export const evaluate_program = (prog: LogicProgram, edb: Fact[]): Fact[] => {
    const has_ext = has_extended_atoms(prog.rules)

    if (prog.strategy === "semi-naive" && !has_ext) {
        // Delegate to the optimised MiniDatalog semi-naive engine
        return semi_naive_datalog(prog.rules as Rule[], edb)
    }

    if (prog.strategy === "naive" && !has_ext) {
        return naive_datalog(prog.rules as Rule[], edb)
    }

    // Extended atoms or incremental strategy → extended naive fixpoint
    return evaluate_extended_naive(prog.rules, edb)
}
