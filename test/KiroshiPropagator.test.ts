// SPDX-License-Identifier: GPL-3.0-or-later
//
// Tests for KiroshiPropagator — incremental reactive Datalog in the lain-lang stack.
//
// Groups:
//   1. Basic derivation (copy rule, binary join)
//   2. Incremental updates — engine extends closure without re-evaluation from scratch
//   3. Multi-EDB — facts from several input cells are joined correctly
//   4. LogicProgram compatibility — derive_program_kiroshi accepts LogicProgram
//   5. Topology propagator — construct_kiroshi_topology_propagator produces flows_to / reachable
//   6. Stdlib primitives — datalog:reactive:derive and datalog:reactive:topology are registered

import { describe, test, expect, beforeEach } from "bun:test"
import { V } from "pmatcher/new_match/MiniDatalog"
import type { Rule } from "pmatcher/new_match/MiniDatalog"
import {
    construct_cell,
    add_cell_content as update_cell,
    cell_strongest_base_value,
    execute_all_tasks_sequential,
    cell_id,
    p_sync,
} from "ppropogator"
import {
    install_datalog_handlers,
    make_fact_set,
    is_fact_set,
    type FactSet,
} from "../compiler/datalog/DatalogPropagator"
import {
    construct_kiroshi_propagator,
    derive_facts_kiroshi,
    derive_program_kiroshi,
    construct_kiroshi_topology_propagator,
    install_kiroshi_merge_handlers,
} from "../compiler/datalog/KiroshiPropagator"
import {
    atom,
    rule,
    program,
    V as LV,
} from "../compiler/datalog/LogicProgram"
import {
    special_primitive_specs,
    datalog_special_primitive_specs,
} from "../compiler/primitive/stdlib"
import {
    p_datalog_assert,
    p_datalog_derive,
    p_datalog_union,
    p_datalog_query,
    make_query_pattern,
} from "../compiler/primitive/stdlib/datalog"
import { init_system } from "../compiler/incremental_compiler"
import { raw_compile } from "../compiler/compiler_entry"
import { primitive_env } from "../compiler/closure"
import { extend_env } from "../compiler/env"
import { ce_constant } from "ppropogator"

const run = () => execute_all_tasks_sequential((e) => { throw e })

const facts_of = (cell: any): FactSet["facts"] => {
    const val = cell_strongest_base_value(cell)
    if (!is_fact_set(val)) return []
    return (val as FactSet).facts
}

const has_fact = (cell: any, fact: any[]) =>
    facts_of(cell).some(f => JSON.stringify(f) === JSON.stringify(fact))

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
    init_system()
    install_datalog_handlers()
})

// ─── 1. Basic derivation ─────────────────────────────────────────────────────

describe("basic derivation", () => {
    test("copy rule: path(X,Y) :- edge(X,Y)", () => {
        const copy_rules: Rule[] = [
            { head: ["path", V("X"), V("Y")], body: [["edge", V("X"), V("Y")]] },
        ]
        const edb = construct_cell<FactSet>("edges")
        const out = derive_facts_kiroshi([edb], copy_rules, "copy_test")

        update_cell(edb, make_fact_set([["edge", "a", "b"], ["edge", "b", "c"]]))
        run()

        expect(has_fact(out, ["path", "a", "b"])).toBe(true)
        expect(has_fact(out, ["path", "b", "c"])).toBe(true)
        expect(facts_of(out)).toHaveLength(2)
    })

    test("binary join: sibling(X,Y) :- parent(P,X), parent(P,Y)", () => {
        const sibling_rules: Rule[] = [
            {
                head: ["sibling", V("X"), V("Y")],
                body: [["parent", V("P"), V("X")], ["parent", V("P"), V("Y")]],
            },
        ]
        const edb = construct_cell<FactSet>("parents")
        const out = derive_facts_kiroshi([edb], sibling_rules, "sibling_test")

        update_cell(edb, make_fact_set([
            ["parent", "alice", "bob"],
            ["parent", "alice", "charlie"],
        ]))
        run()

        expect(has_fact(out, ["sibling", "bob",     "bob"])).toBe(true)
        expect(has_fact(out, ["sibling", "bob",     "charlie"])).toBe(true)
        expect(has_fact(out, ["sibling", "charlie", "bob"])).toBe(true)
        expect(has_fact(out, ["sibling", "charlie", "charlie"])).toBe(true)
        expect(facts_of(out)).toHaveLength(4)
    })

    test("transitive closure over three-node chain", () => {
        const tc_rules: Rule[] = [
            { head: ["path", V("X"), V("Y")], body: [["edge", V("X"), V("Y")]] },
            { head: ["path", V("X"), V("Z")], body: [["path", V("X"), V("Y")], ["edge", V("Y"), V("Z")]] },
        ]
        const edb = construct_cell<FactSet>("tc_edges")
        const out = derive_facts_kiroshi([edb], tc_rules, "tc_test")

        update_cell(edb, make_fact_set([
            ["edge", "a", "b"],
            ["edge", "b", "c"],
        ]))
        run()

        expect(has_fact(out, ["path", "a", "b"])).toBe(true)
        expect(has_fact(out, ["path", "b", "c"])).toBe(true)
        expect(has_fact(out, ["path", "a", "c"])).toBe(true)
        expect(facts_of(out)).toHaveLength(3)
    })
})

// ─── 2. Incremental updates ───────────────────────────────────────────────────

describe("incremental updates", () => {
    test("second edge addition extends transitive closure without recomputing from scratch", () => {
        const tc_rules: Rule[] = [
            { head: ["path", V("X"), V("Y")], body: [["edge", V("X"), V("Y")]] },
            { head: ["path", V("X"), V("Z")], body: [["path", V("X"), V("Y")], ["edge", V("Y"), V("Z")]] },
        ]
        const edb = construct_cell<FactSet>("incr_edges")
        const out = derive_facts_kiroshi([edb], tc_rules, "incr_test")

        update_cell(edb, make_fact_set([["edge", "a", "b"]]))
        run()
        expect(facts_of(out)).toHaveLength(1)
        expect(has_fact(out, ["path", "a", "b"])).toBe(true)

        // Adding a second edge should derive path(b,c) and path(a,c) incrementally
        update_cell(edb, make_fact_set([["edge", "b", "c"]]))
        run()
        expect(has_fact(out, ["path", "b", "c"])).toBe(true)
        expect(has_fact(out, ["path", "a", "c"])).toBe(true)
        expect(facts_of(out)).toHaveLength(3)
    })

    test("three incremental steps build 4-node chain closure", () => {
        const tc_rules: Rule[] = [
            { head: ["path", V("X"), V("Y")], body: [["edge", V("X"), V("Y")]] },
            { head: ["path", V("X"), V("Z")], body: [["path", V("X"), V("Y")], ["edge", V("Y"), V("Z")]] },
        ]
        const edb = construct_cell<FactSet>("chain4")
        const out = derive_facts_kiroshi([edb], tc_rules, "chain4_test")

        update_cell(edb, make_fact_set([["edge", "a", "b"]])); run()
        expect(facts_of(out)).toHaveLength(1)

        update_cell(edb, make_fact_set([["edge", "b", "c"]])); run()
        expect(facts_of(out)).toHaveLength(3)

        update_cell(edb, make_fact_set([["edge", "c", "d"]])); run()
        expect(facts_of(out)).toHaveLength(6)  // a-b, b-c, c-d, a-c, b-d, a-d
    })
})

// ─── 3. Multi-EDB ─────────────────────────────────────────────────────────────

describe("multi-EDB", () => {
    test("facts from two separate EDB cells are joined correctly", () => {
        const tc_rules: Rule[] = [
            { head: ["path", V("X"), V("Y")], body: [["edge", V("X"), V("Y")]] },
            { head: ["path", V("X"), V("Z")], body: [["path", V("X"), V("Y")], ["edge", V("Y"), V("Z")]] },
        ]
        const edb1 = construct_cell<FactSet>("multi_edges_1")
        const edb2 = construct_cell<FactSet>("multi_edges_2")
        const out  = derive_facts_kiroshi([edb1, edb2], tc_rules, "multi_test")

        update_cell(edb1, make_fact_set([["edge", "a", "b"]]))
        update_cell(edb2, make_fact_set([["edge", "b", "c"]]))
        run()

        expect(has_fact(out, ["path", "a", "b"])).toBe(true)
        expect(has_fact(out, ["path", "b", "c"])).toBe(true)
        expect(has_fact(out, ["path", "a", "c"])).toBe(true)
    })
})

// ─── 4. LogicProgram compatibility ────────────────────────────────────────────

describe("LogicProgram compatibility", () => {
    test("derive_program_kiroshi accepts a LogicProgram declaration", () => {
        const prog = program("semi-naive",
            rule(atom("path", V("X"), V("Y")), atom("edge", V("X"), V("Y"))),
            rule(atom("path", V("X"), V("Z")),
                 atom("path", V("X"), V("Y")), atom("edge", V("Y"), V("Z")))
        )
        const edb = construct_cell<FactSet>("lp_edges")
        const out = derive_program_kiroshi([edb], prog, "lp_test")

        update_cell(edb, make_fact_set([["edge", "a", "b"], ["edge", "b", "c"]]))
        run()

        expect(has_fact(out, ["path", "a", "c"])).toBe(true)
    })
})

// ─── 5. Topology propagator ───────────────────────────────────────────────────

describe("topology propagator", () => {
    test("construct_kiroshi_topology_propagator produces flows_to facts", () => {
        // Create a small propagator network: a → (prop) → b
        const a       = construct_cell<number>("topo_a")
        const b       = construct_cell<number>("topo_b")
        const trigger = construct_cell<boolean>("topo_trigger")

        p_sync(a, b)  // creates a propagator reading a, writing b
        run()

        const derived = construct_kiroshi_topology_propagator(trigger, "topo_test")

        update_cell(trigger, true)
        run()

        const all_facts = facts_of(derived)
        const has_flows_to = all_facts.some(f => f[0] === "flows_to")
        const has_reachable = all_facts.some(f => f[0] === "reachable")

        expect(has_flows_to).toBe(true)
        expect(has_reachable).toBe(true)

        // a → b via p_sync should produce flows_to(a_id, b_id) and reachable(a_id, b_id)
        const a_id = cell_id(a)
        const b_id = cell_id(b)
        expect(has_fact(derived, ["flows_to", a_id, b_id])).toBe(true)
        expect(has_fact(derived, ["reachable", a_id, b_id])).toBe(true)
    })
})

// ─── 6. Stdlib primitives ─────────────────────────────────────────────────────

describe("stdlib primitives", () => {
    test("datalog_special_primitive_specs contains both reactive primitives", () => {
        const keys = datalog_special_primitive_specs.map(s => s.key)
        expect(keys).toContain("datalog:reactive:derive")
        expect(keys).toContain("datalog:reactive:topology")
    })

    test("special_primitive_specs includes the reactive datalog primitives", () => {
        const all_keys = special_primitive_specs.map(s => s.key)
        expect(all_keys).toContain("datalog:reactive:derive")
        expect(all_keys).toContain("datalog:reactive:topology")
    })

    test("special_primitive_specs has no duplicate keys", () => {
        const keys  = special_primitive_specs.map(s => s.key)
        const uniq  = new Set(keys)
        expect(uniq.size).toBe(keys.length)
    })

    test("datalog:reactive:derive constructor wires an incremental engine", () => {
        const { p_kiroshi_derive } = require("../compiler/primitive/stdlib/datalog")
        const edb      = construct_cell<FactSet>("derive_prim_edb")
        const rules_c  = construct_cell<Rule[]>("derive_prim_rules")
        const output   = construct_cell<FactSet>("derive_prim_out")

        const tc_rules: Rule[] = [
            { head: ["path", V("X"), V("Y")], body: [["edge", V("X"), V("Y")]] },
            { head: ["path", V("X"), V("Z")], body: [["path", V("X"), V("Y")], ["edge", V("Y"), V("Z")]] },
        ]

        p_kiroshi_derive(edb, rules_c, output)

        update_cell(rules_c, tc_rules)
        update_cell(edb, make_fact_set([["edge", "a", "b"], ["edge", "b", "c"]]))
        run()

        expect(has_fact(output, ["path", "a", "c"])).toBe(true)
    })

    test("datalog_special_primitive_specs contains all five query-language primitives", () => {
        const keys = datalog_special_primitive_specs.map(s => s.key)
        // datalog:assert is intentionally excluded — see note in datalog.ts
        expect(keys).not.toContain("datalog:assert")
        expect(keys).toContain("datalog:derive")
        expect(keys).toContain("datalog:union")
        expect(keys).toContain("datalog:query")
        expect(keys).toContain("datalog:reactive:derive")
        expect(keys).toContain("datalog:reactive:topology")
    })
})

// ─── 7. New stdlib query-language primitives ──────────────────────────────────

// Note: p_datalog_assert is exported for advanced use but NOT a registered stdlib
// primitive (see datalog.ts comment).  We test it here to document correct usage.
describe("datalog:assert (standalone helper, not in specs)", () => {
    test("piping a FactSet cell through assert to an output cell", async () => {
        // Correct usage: create a FactSet cell with make_fact_set first
        const source = construct_cell<FactSet>("assert_source")
        const out    = construct_cell<FactSet>("assert_out")

        p_datalog_assert(source, out)

        update_cell(source, make_fact_set([["edge", "a", "b"], ["edge", "b", "c"]]))
        run()

        expect(has_fact(out, ["edge", "a", "b"])).toBe(true)
        expect(has_fact(out, ["edge", "b", "c"])).toBe(true)
    })

    test("does nothing when source cell is empty", async () => {
        const source = construct_cell<FactSet>("assert_empty_source")
        const out    = construct_cell<FactSet>("assert_empty_out")

        p_datalog_assert(source, out)
        run()

        expect(facts_of(out)).toHaveLength(0)
    })
})

describe("datalog:derive (batch)", () => {
    test("derives transitive closure via semi-naive fixpoint", async () => {
        const edb    = construct_cell<FactSet>("batch_edb")
        const rules_c = construct_cell<Rule[]>("batch_rules")
        const out    = construct_cell<FactSet>("batch_out")

        const tc_rules: Rule[] = [
            { head: ["path", V("X"), V("Y")], body: [["edge", V("X"), V("Y")]] },
            { head: ["path", V("X"), V("Z")], body: [["path", V("X"), V("Y")], ["edge", V("Y"), V("Z")]] },
        ]

        p_datalog_derive(edb, rules_c, out)

        update_cell(rules_c, tc_rules)
        update_cell(edb, make_fact_set([["edge", "a", "b"], ["edge", "b", "c"]]))
        run()

        expect(has_fact(out, ["path", "a", "b"])).toBe(true)
        expect(has_fact(out, ["path", "b", "c"])).toBe(true)
        expect(has_fact(out, ["path", "a", "c"])).toBe(true)
    })

    test("accepts a LogicProgram as rules", async () => {
        const edb    = construct_cell<FactSet>("lp_batch_edb")
        const rules_c = construct_cell<any>("lp_batch_rules")
        const out    = construct_cell<FactSet>("lp_batch_out")

        const prog = program("semi-naive",
            rule(atom("path", LV("X"), LV("Y")), atom("edge", LV("X"), LV("Y"))),
        )

        p_datalog_derive(edb, rules_c, out)

        update_cell(rules_c, prog)
        update_cell(edb, make_fact_set([["edge", "x", "y"]]))
        run()

        expect(has_fact(out, ["path", "x", "y"])).toBe(true)
    })
})

describe("datalog:union", () => {
    test("merges two FactSet cells, deduplicating shared facts", async () => {
        const a   = construct_cell<FactSet>("union_a")
        const b   = construct_cell<FactSet>("union_b")
        const out = construct_cell<FactSet>("union_out")

        p_datalog_union(a, b, out)

        update_cell(a, make_fact_set([["edge", "a", "b"], ["edge", "b", "c"]]))
        update_cell(b, make_fact_set([["edge", "b", "c"], ["edge", "c", "d"]]))
        run()

        expect(has_fact(out, ["edge", "a", "b"])).toBe(true)
        expect(has_fact(out, ["edge", "b", "c"])).toBe(true)
        expect(has_fact(out, ["edge", "c", "d"])).toBe(true)
        expect(facts_of(out)).toHaveLength(3)
    })
})

describe("datalog:query", () => {
    test("returns ground facts that match the pattern", async () => {
        const tc_rules: Rule[] = [
            { head: ["path", V("X"), V("Y")], body: [["edge", V("X"), V("Y")]] },
            { head: ["path", V("X"), V("Z")], body: [["path", V("X"), V("Y")], ["edge", V("Y"), V("Z")]] },
        ]
        const edb     = construct_cell<FactSet>("query_edb")
        const derived = construct_cell<FactSet>("query_derived")
        const pattern_c = construct_cell<any>("query_pattern")
        const results = construct_cell<FactSet>("query_results")

        construct_kiroshi_propagator([edb], tc_rules, derived)
        p_datalog_query(derived, pattern_c, results)

        update_cell(edb, make_fact_set([["edge", "a", "b"], ["edge", "b", "c"]]))
        // Query: all paths starting from "a"
        update_cell(pattern_c, make_query_pattern(["path", "a", V("Y")]))
        run()

        expect(has_fact(results, ["path", "a", "b"])).toBe(true)
        expect(has_fact(results, ["path", "a", "c"])).toBe(true)
        // path(b,c) does not start from "a"
        expect(has_fact(results, ["path", "b", "c"])).toBe(false)
    })

    test("outputs empty FactSet when no facts match", async () => {
        const derived   = construct_cell<FactSet>("query_nomatch_derived")
        const pattern_c = construct_cell<any>("query_nomatch_pattern")
        const results   = construct_cell<FactSet>("query_nomatch_results")

        p_datalog_query(derived, pattern_c, results)

        update_cell(derived, make_fact_set([["edge", "a", "b"]]))
        update_cell(pattern_c, make_query_pattern(["path", V("X"), V("Y")]))
        run()

        expect(facts_of(results)).toHaveLength(0)
    })

    test("can be chained: edb (FactSet) → derive → query", async () => {
        const edb       = construct_cell<FactSet>("chain_edb")
        const rules_c   = construct_cell<Rule[]>("chain_rules")
        const derived   = construct_cell<FactSet>("chain_derived")
        const pattern_c = construct_cell<any>("chain_pattern")
        const results   = construct_cell<FactSet>("chain_results")

        const copy_rules: Rule[] = [
            { head: ["connected", V("X"), V("Y")], body: [["link", V("X"), V("Y")]] },
        ]

        p_datalog_derive(edb, rules_c, derived)
        p_datalog_query(derived, pattern_c, results)

        update_cell(rules_c, copy_rules)
        // EDB cells always hold FactSet — use make_fact_set to create one
        update_cell(edb, make_fact_set([["link", "p", "q"], ["link", "q", "r"]]))
        update_cell(pattern_c, make_query_pattern(["connected", V("X"), V("Y")]))
        run()

        expect(has_fact(results, ["connected", "p", "q"])).toBe(true)
        expect(has_fact(results, ["connected", "q", "r"])).toBe(true)
    })
})

// ─── 8. Compiler / DSL integration ───────────────────────────────────────────
//
// These tests verify that the datalog primitives can be invoked through the
// lain compiler DSL — (datalog:derive edb rules out) — not just called directly
// as TypeScript functions.
//
// Pattern: create cells explicitly, put them in the env, call raw_compile to wire
// the network, then update the cells with data, then execute.  This mirrors the
// direct-call tests and avoids ce_constant timing issues with the incremental compiler.

describe("datalog via compiler DSL", () => {
    test("datalog primitives are resolved by name in primitive_env", async () => {
        const env = primitive_env("dl-names")
        const names = [
            "datalog:derive",
            "datalog:union",
            "datalog:query",
            "datalog:reactive:derive",
            "datalog:reactive:topology",
        ]
        const cells = names.map(n => raw_compile(n, env))
        await execute_all_tasks_sequential(e => { throw e })
        for (let i = 0; i < names.length; i++) {
            const prim = cell_strongest_base_value(cells[i]!) as any
            expect(prim?.name).toBe(names[i])
        }
    })

    test("(datalog:derive edb rules out) derives transitive closure", async () => {
        // Use LogicProgram (an object, not a plain array) to avoid array-merge
        // interference from the kiroshi engine's generic_merge(is_array, is_array) handler.
        const tc_prog = program("semi-naive",
            rule(atom("path", LV("X"), LV("Y")), atom("edge", LV("X"), LV("Y"))),
            rule(atom("path", LV("X"), LV("Z")), atom("path", LV("X"), LV("Y")), atom("edge", LV("Y"), LV("Z"))),
        )
        const edb_cell   = construct_cell<FactSet>("dl-derive-edb")
        const rules_cell = construct_cell<any>("dl-derive-rules")

        const env = extend_env(primitive_env("dl-derive-dsl"), [
            ["edb",   edb_cell],
            ["rules", rules_cell],
        ])

        raw_compile("(datalog:derive edb rules out)", env)

        update_cell(rules_cell, tc_prog)
        update_cell(edb_cell,   make_fact_set([["edge","a","b"],["edge","b","c"]]))
        await execute_all_tasks_sequential(e => { throw e })

        const e = cell_strongest_base_value(env) as Map<string, any>
        const out = e.get("out")
        expect(out).toBeDefined()
        expect(has_fact(out, ["path", "a", "b"])).toBe(true)
        expect(has_fact(out, ["path", "b", "c"])).toBe(true)
        expect(has_fact(out, ["path", "a", "c"])).toBe(true)
    })

    test("(datalog:union a b out) merges two FactSet cells", async () => {
        const a_cell = construct_cell<FactSet>("dl-union-a")
        const b_cell = construct_cell<FactSet>("dl-union-b")

        const env = extend_env(primitive_env("dl-union-dsl"), [
            ["a", a_cell],
            ["b", b_cell],
        ])

        raw_compile("(datalog:union a b out)", env)

        update_cell(a_cell, make_fact_set([["edge","a","b"],["edge","b","c"]]))
        update_cell(b_cell, make_fact_set([["edge","b","c"],["edge","c","d"]]))
        await execute_all_tasks_sequential(e => { throw e })

        const e = cell_strongest_base_value(env) as Map<string, any>
        const out = e.get("out")
        expect(out).toBeDefined()
        expect(has_fact(out, ["edge","a","b"])).toBe(true)
        expect(has_fact(out, ["edge","c","d"])).toBe(true)
        expect(facts_of(out)).toHaveLength(3)
    })

    test("(datalog:query derived pattern results) filters by pattern", async () => {
        // Single-pass approach: compile both derive and query in one env so all
        // accessor cells start as the_nothing and values flow through naturally.
        // This avoids the two-phase timing issue where pre-populated cells can
        // arrive at the inner compound_propagator before both inputs are usable.
        const tc_prog = program("semi-naive",
            rule(atom("path", LV("X"), LV("Y")), atom("edge", LV("X"), LV("Y"))),
            rule(atom("path", LV("X"), LV("Z")), atom("path", LV("X"), LV("Y")), atom("edge", LV("Y"), LV("Z"))),
        )
        const edb_cell     = construct_cell<FactSet>("dl-query-edb")
        const rules_cell   = construct_cell<any>("dl-query-rules")
        const pattern_cell = construct_cell<any>("dl-query-pattern")

        const env = extend_env(primitive_env("dl-query-dsl"), [
            ["edb",     edb_cell],
            ["rules",   rules_cell],
            ["pattern", pattern_cell],
        ])

        // Wire derive → query in one compilation pass.
        // "(datalog:derive edb rules derived)" binds "derived" to the derive output.
        // "(datalog:query derived pattern results)" looks it up from the same env.
        raw_compile("(datalog:derive edb rules derived)", env)
        raw_compile("(datalog:query derived pattern results)", env)

        update_cell(rules_cell,   tc_prog)
        update_cell(edb_cell,     make_fact_set([["edge","a","b"],["edge","b","c"]]))
        // QueryPattern boxes the raw array so the cell system doesn't mistake it
        // for a GenericValueSet (which treats every array as concurrent values).
        update_cell(pattern_cell, make_query_pattern(["path", "a", V("Y")]))
        await execute_all_tasks_sequential(e => { throw e })

        const envMap = cell_strongest_base_value(env) as Map<string, any>
        const results_cell = envMap.get("results")
        expect(results_cell).toBeDefined()
        expect(has_fact(results_cell, ["path","a","b"])).toBe(true)
        expect(has_fact(results_cell, ["path","a","c"])).toBe(true)
        expect(has_fact(results_cell, ["path","b","c"])).toBe(false)
    })

    test("(datalog:reactive:derive edb rules out) wires incremental kiroshi engine", async () => {
        const tc_prog = program("semi-naive",
            rule(atom("path", LV("X"), LV("Y")), atom("edge", LV("X"), LV("Y"))),
            rule(atom("path", LV("X"), LV("Z")), atom("path", LV("X"), LV("Y")), atom("edge", LV("Y"), LV("Z"))),
        )
        const edb_cell   = construct_cell<FactSet>("dl-reactive-edb")
        const rules_cell = construct_cell<any>("dl-reactive-rules")

        const env = extend_env(primitive_env("dl-reactive-dsl"), [
            ["edb",   edb_cell],
            ["rules", rules_cell],
        ])

        raw_compile("(datalog:reactive:derive edb rules out)", env)

        update_cell(rules_cell, tc_prog)
        update_cell(edb_cell,   make_fact_set([["edge","a","b"],["edge","b","c"]]))
        await execute_all_tasks_sequential(e => { throw e })

        const e = cell_strongest_base_value(env) as Map<string, any>
        const out = e.get("out")
        expect(out).toBeDefined()
        expect(has_fact(out, ["path","a","c"])).toBe(true)
    })
})
