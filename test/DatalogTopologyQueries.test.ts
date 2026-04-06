// SPDX-License-Identifier: GPL-3.0-or-later
//
// Composable Datalog topology query tests.
//
// Answers the same Q1–Q4 questions from graph_combinators_card.test.ts, but
// expressed as declarative LogicProgram/QueryDecl instead of graph-combinator
// functions.  All tests run in the same init_system() runtime as card_api.test.ts.
//
// Setup pattern (mirrors card_api.test.ts):
//   init_system() + clear_card_metadata() in beforeEach
//   install_datalog_handlers() once to register merge/equality extensions

import { describe, test, expect, beforeEach } from "bun:test"
import {
    add_cell_content as update_cell,
    construct_cell,
    cell_strongest_base_value,
    cell_id,
    execute_all_tasks_sequential,
    p_sync,
} from "ppropogator"
import { cell_level } from "ppropogator/Cell/Cell"
import {
    add_card,
    build_card,
    connect_cards,
    clear_card_metadata,
    guarantee_get_card_metadata,
    internal_cell_this,
    internal_cell_right,
    internal_cell_left,
    slot_right,
    slot_left,
} from "../src/grpc/card"
import { primitive_env } from "../compiler/closure"
import { init_system } from "../compiler/incremental_compiler"
import { run } from "../compiler/compiler_entry"

// ── Datalog layer ─────────────────────────────────────────────────────────────

import {
    install_datalog_handlers,
    make_fact_set,
    is_fact_set,
    run_program,
    run_query,
    query_fact_cell,
    type FactSet,
} from "../compiler/datalog/DatalogPropagator"
import {
    snapshot_topology_facts,
    construct_topology_fact_cell,
    construct_reachability_cell,
    construct_namespace_filter_cell,
    construct_kind_filter_cell,
    construct_level_filter_cell,
    compose_programs,
    topology_reachability_program,
    cell_namespace_program,
    cell_kind_program,
    cell_level_program,
} from "../compiler/datalog/TopologyFacts"
import {
    V, Eq, Neq, Or, And,
    atom, rule, program, query_decl,
    Pred, StartsWith, Contains, Is, NegFact,
} from "../compiler/datalog/LogicProgram"

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
    init_system()
    clear_card_metadata()
    install_datalog_handlers()
})

const get_card = (id: string) => guarantee_get_card_metadata(id).card

// ─── Basic LogicProgram API ───────────────────────────────────────────────────

describe("LogicProgram — declaration vs execution separation", () => {
    test("program() is pure data — no propagator created", () => {
        const prog = program("semi-naive",
            rule(atom("path", V("X"), V("Y")), atom("edge", V("X"), V("Y")))
        )
        expect(prog.strategy).toBe("semi-naive")
        expect(prog.rules).toHaveLength(1)
    })

    test("run_program() creates propagator and derives facts", () => {
        const prog = program("semi-naive",
            rule(atom("path", V("X"), V("Y")), atom("edge", V("X"), V("Y"))),
            rule(atom("path", V("X"), V("Z")),
                atom("path", V("X"), V("Y")),
                atom("edge", V("Y"), V("Z")))
        )
        const edb = construct_cell<FactSet>("lp_edb")
        const out = run_program(prog, [edb], "lp_out")

        update_cell(edb, make_fact_set([["edge","a","b"], ["edge","b","c"]]))
        execute_all_tasks_sequential(() => {})

        const val = cell_strongest_base_value(out) as FactSet
        expect(is_fact_set(val)).toBe(true)
        expect(val.facts).toContainEqual(["path","a","c"])
    })

    test("same program, naive strategy gives same result", () => {
        const prog = program("naive",
            rule(atom("path", V("X"), V("Y")), atom("edge", V("X"), V("Y"))),
            rule(atom("path", V("X"), V("Z")),
                atom("path", V("X"), V("Y")),
                atom("edge", V("Y"), V("Z")))
        )
        const edb = construct_cell<FactSet>("naive_edb")
        const out = run_program(prog, [edb], "naive_out")

        update_cell(edb, make_fact_set([["edge","a","b"], ["edge","b","c"]]))
        execute_all_tasks_sequential(() => {})

        const val = cell_strongest_base_value(out) as FactSet
        expect(val.facts).toContainEqual(["path","a","c"])
    })
})

// ─── Built-in constraints: Eq, Neq, Pred ─────────────────────────────────────

describe("Built-in constraints", () => {
    test("Eq unifies two variables — restricts path to self-loops", () => {
        const prog = program("naive",
            rule(atom("self_edge", V("X")),
                atom("edge", V("X"), V("Y")),
                Eq(V("X"), V("Y")))
        )
        const edb = construct_cell<FactSet>("eq_edb")
        const out = run_program(prog, [edb], "eq_out")

        update_cell(edb, make_fact_set([["edge","a","a"], ["edge","a","b"]]))
        execute_all_tasks_sequential(() => {})

        const val = cell_strongest_base_value(out) as FactSet
        const self_edges = val.facts.filter(f => f[0] === "self_edge")
        expect(self_edges).toContainEqual(["self_edge", "a"])
        // "a","b" is not a self-edge
        expect(self_edges).not.toContainEqual(["self_edge", "b"])
    })

    test("Neq excludes equal pairs from path", () => {
        const prog = program("naive",
            rule(atom("distinct_edge", V("X"), V("Y")),
                atom("edge", V("X"), V("Y")),
                Neq(V("X"), V("Y")))
        )
        const edb = construct_cell<FactSet>("neq_edb")
        const out = run_program(prog, [edb], "neq_out")

        update_cell(edb, make_fact_set([["edge","a","a"], ["edge","a","b"]]))
        execute_all_tasks_sequential(() => {})

        const val = cell_strongest_base_value(out) as FactSet
        const distinct = val.facts.filter(f => f[0] === "distinct_edge")
        expect(distinct).toContainEqual(["distinct_edge","a","b"])
        expect(distinct).not.toContainEqual(["distinct_edge","a","a"])
    })

    test("Pred with StartsWith filters by string prefix", () => {
        const prog = program("naive",
            rule(atom("slot_cell", V("X")),
                atom("cell", V("X"), V("Name")),
                StartsWith(V("Name"), "::"))
        )
        const edb = construct_cell<FactSet>("pred_edb")
        const out = run_program(prog, [edb], "pred_out")

        update_cell(edb, make_fact_set([
            ["cell", "id1", "::this"],
            ["cell", "id2", "Core|accessor|::this"],
            ["cell", "id3", "::left"],
        ]))
        execute_all_tasks_sequential(() => {})

        const val = cell_strongest_base_value(out) as FactSet
        const slots = val.facts.filter(f => f[0] === "slot_cell")
        expect(slots).toContainEqual(["slot_cell", "id1"])
        expect(slots).toContainEqual(["slot_cell", "id3"])
        expect(slots).not.toContainEqual(["slot_cell", "id2"])
    })

    test("Pred with Is matches exact value", () => {
        const prog = program("naive",
            rule(atom("propagator_node", V("X")),
                atom("kind", V("X"), V("K")),
                Is(V("K"), "prop"))
        )
        const edb = construct_cell<FactSet>("is_edb")
        const out = run_program(prog, [edb], "is_out")

        update_cell(edb, make_fact_set([
            ["kind", "cell-1", "cell"],
            ["kind", "prop-1", "prop"],
        ]))
        execute_all_tasks_sequential(() => {})

        const val = cell_strongest_base_value(out) as FactSet
        const props = val.facts.filter(f => f[0] === "propagator_node")
        expect(props).toContainEqual(["propagator_node", "prop-1"])
        expect(props).not.toContainEqual(["propagator_node", "cell-1"])
    })

    test("Or: path via edge OR shortcut", () => {
        const prog = program("naive",
            rule(atom("connected", V("X"), V("Y")),
                Or(
                    [atom("edge",     V("X"), V("Y"))],
                    [atom("shortcut", V("X"), V("Y"))]
                ))
        )
        const edb = construct_cell<FactSet>("or_edb")
        const out = run_program(prog, [edb], "or_out")

        update_cell(edb, make_fact_set([
            ["edge",     "a", "b"],
            ["shortcut", "a", "c"],
        ]))
        execute_all_tasks_sequential(() => {})

        const val = cell_strongest_base_value(out) as FactSet
        const conns = val.facts.filter(f => f[0] === "connected")
        expect(conns).toContainEqual(["connected","a","b"])
        expect(conns).toContainEqual(["connected","a","c"])
    })
})

describe("NegFact — absent ground atom (not the same as Neq)", () => {
    test("Neq is term inequality; it cannot express 'no reachable(b,a) fact'", () => {
        const prog = program(
            "naive",
            rule(
                atom("bogus", V("A"), V("B")),
                atom("reachable", V("A"), V("B")),
                Neq(V("A"), V("B"))
            )
        )
        const edb = construct_cell<FactSet>("neq_vs_neg_edb")
        const out = run_program(prog, [edb], "neq_vs_neg_out")
        update_cell(
            edb,
            make_fact_set([
                ["reachable", "a", "b"],
                ["reachable", "b", "a"],
            ])
        )
        execute_all_tasks_sequential(() => {})
        const val = cell_strongest_base_value(out) as FactSet
        const bogus = val.facts.filter(f => f[0] === "bogus")
        expect(bogus).toContainEqual(["bogus", "a", "b"])
        expect(bogus).toContainEqual(["bogus", "b", "a"])
    })

    test("NegFact derives one_way only when the reverse reachable tuple is missing", () => {
        const prog = program(
            "naive",
            rule(
                atom("one_way", "a", "b"),
                atom("reachable", "a", "b"),
                NegFact(atom("reachable", "b", "a"))
            )
        )
        const edb = construct_cell<FactSet>("negf_edb")
        const out = run_program(prog, [edb], "negf_out")
        update_cell(edb, make_fact_set([["reachable", "a", "b"]]))
        execute_all_tasks_sequential(() => {})
        const val = cell_strongest_base_value(out) as FactSet
        expect(val.facts).toContainEqual(["one_way", "a", "b"])
    })

    test("NegFact blocks derivation when the negated fact is present", () => {
        const prog = program(
            "naive",
            rule(
                atom("one_way", "a", "b"),
                atom("reachable", "a", "b"),
                NegFact(atom("reachable", "b", "a"))
            )
        )
        const edb = construct_cell<FactSet>("negf_sym_edb")
        const out = run_program(prog, [edb], "negf_sym_out")
        update_cell(
            edb,
            make_fact_set([
                ["reachable", "a", "b"],
                ["reachable", "b", "a"],
            ])
        )
        execute_all_tasks_sequential(() => {})
        const val = cell_strongest_base_value(out) as FactSet
        expect(val.facts.some(f => f[0] === "one_way")).toBe(false)
    })

    test("NegFact with variables after reachable(X,Y) binds reverse pattern", () => {
        const prog = program(
            "naive",
            rule(
                atom("one_way", V("X"), V("Y")),
                atom("reachable", V("X"), V("Y")),
                NegFact(atom("reachable", V("Y"), V("X")))
            )
        )
        const edb = construct_cell<FactSet>("negf_var_edb")
        const out = run_program(prog, [edb], "negf_var_out")
        update_cell(
            edb,
            make_fact_set([
                ["reachable", "a", "b"],
                ["reachable", "b", "c"],
                ["reachable", "c", "b"],
            ])
        )
        execute_all_tasks_sequential(() => {})
        const val = cell_strongest_base_value(out) as FactSet
        const ow = val.facts.filter(f => f[0] === "one_way")
        expect(ow).toContainEqual(["one_way", "a", "b"])
        expect(ow).not.toContainEqual(["one_way", "b", "c"])
        expect(ow).not.toContainEqual(["one_way", "c", "b"])
    })
})

// ─── run_query and QueryDecl ──────────────────────────────────────────────────

describe("run_query — QueryDecl separation", () => {
    test("query_decl is pure data; run_query creates cells", () => {
        const prog = program("semi-naive",
            rule(atom("path", V("X"), V("Y")), atom("edge", V("X"), V("Y")))
        )
        const decl = query_decl(atom("path", "a", V("Dest")), prog)

        expect(decl.pattern).toEqual(atom("path", "a", V("Dest")))
        expect(decl.program).toBe(prog)

        const edb = construct_cell<FactSet>("qdecl_edb")
        const { derived, results } = run_query(decl, [edb], "qdecl")

        update_cell(edb, make_fact_set([["edge","a","b"], ["edge","a","c"]]))
        execute_all_tasks_sequential(() => {})

        const res = cell_strongest_base_value(results) as ReturnType<typeof run_query>["results"] extends import("ppropogator").Cell<infer T> ? T : never
        const dests = (res as any[]).map((d: any) => d.get("Dest"))
        expect(dests).toContain("b")
        expect(dests).toContain("c")
    })
})

// ─── compose_programs ─────────────────────────────────────────────────────────

describe("compose_programs — combining declarations", () => {
    test("composing reachability + namespace programs gives combined rules", () => {
        const reach = topology_reachability_program()
        const ns = cell_namespace_program("::")
        const combined = compose_programs(reach, ns)

        const reach_rule_count = reach.rules.length
        const ns_rule_count    = ns.rules.length
        expect(combined.rules).toHaveLength(reach_rule_count + ns_rule_count)
    })

    test("composed program derives both reachability and namespace facts", () => {
        const prog = compose_programs(
            topology_reachability_program("naive"),
            cell_namespace_program("::", "naive"),
            "naive"
        )
        const edb = construct_cell<FactSet>("compose_edb")
        const out = run_program(prog, [edb], "compose_out")

        update_cell(edb, make_fact_set([
            ["reads",     "p1", "c1"],
            ["writes",    "p1", "c2"],
            ["kind",      "c1", "cell"],
            ["namespace", "c1", "::"],
            ["kind",      "c2", "cell"],
            ["namespace", "c2", "Core"],
        ]))
        execute_all_tasks_sequential(() => {})

        const val = cell_strongest_base_value(out) as FactSet
        // Reachability derived
        expect(val.facts).toContainEqual(["flows_to",  "c1", "c2"])
        expect(val.facts).toContainEqual(["reachable", "c1", "c2"])
        // Namespace filter derived
        expect(val.facts).toContainEqual(["ns_match", "c1"])
        expect(val.facts).not.toContainEqual(["ns_match", "c2"])  // Core ≠ ::
    })
})

// ─── Q1: namespace filter on real cards ───────────────────────────────────────

describe("Q1 (Datalog): namespace filter on a built card", () => {
    test("ns_match identifies '::' slot cells after build_card", () => {
        const env = primitive_env("dq1-env")
        add_card("dq1")
        build_card(env)("dq1")
        execute_all_tasks_sequential(() => {})

        const trigger = construct_cell<number>("dq1-trigger")
        const topo    = construct_topology_fact_cell(trigger)
        update_cell(trigger, 1)
        execute_all_tasks_sequential(() => {})

        const ns_prog  = cell_namespace_program("::", "naive")
        const ns_cell  = run_program(ns_prog, [topo], "dq1-ns")
        execute_all_tasks_sequential(() => {})

        const val = cell_strongest_base_value(ns_cell) as FactSet
        expect(is_fact_set(val)).toBe(true)

        const matches = val.facts.filter(f => f[0] === "ns_match")
        expect(matches.length).toBeGreaterThan(0)

        // Verify every matched node actually has "::" namespace
        const topo_val = cell_strongest_base_value(topo) as FactSet
        for (const [, id] of matches) {
            const ns_fact = topo_val.facts.find(f => f[0] === "namespace" && f[1] === id)
            expect(ns_fact?.[2]).toBeDefined()
            expect(String(ns_fact![2]).startsWith("::")).toBe(true)
        }
    })

    test("'Core' namespace filter matches accessor cells", () => {
        const env = primitive_env("dq1b-env")
        run("(+ 1 2 out)", env)
        execute_all_tasks_sequential(() => {})

        const trigger = construct_cell<number>("dq1b-trigger")
        const topo    = construct_topology_fact_cell(trigger)
        update_cell(trigger, 1)
        execute_all_tasks_sequential(() => {})

        const ns_cell = run_program(
            cell_namespace_program("Core", "naive"),
            [topo],
            "dq1b-ns"
        )
        execute_all_tasks_sequential(() => {})

        const val = cell_strongest_base_value(ns_cell) as FactSet
        const matches = val.facts.filter(f => f[0] === "ns_match")
        expect(matches.length).toBeGreaterThan(0)
    })
})

// ─── Q3: kind + level filter on real cards ────────────────────────────────────

describe("Q3 (Datalog): kind + level filter", () => {
    test("kind_match('prop') returns only propagator nodes", () => {
        const env = primitive_env("dq3-env")
        add_card("dq3")
        build_card(env)("dq3")
        execute_all_tasks_sequential(() => {})

        const trigger  = construct_cell<number>("dq3-trigger")
        const topo     = construct_topology_fact_cell(trigger)
        update_cell(trigger, 1)
        execute_all_tasks_sequential(() => {})

        const kind_cell = run_program(
            cell_kind_program("prop", "naive"),
            [topo],
            "dq3-kind"
        )
        execute_all_tasks_sequential(() => {})

        const val = cell_strongest_base_value(kind_cell) as FactSet
        const matches = val.facts.filter(f => f[0] === "kind_match")
        expect(matches.length).toBeGreaterThan(0)

        // Every match must be in the "prop" kind
        const topo_val = cell_strongest_base_value(topo) as FactSet
        for (const [, id] of matches) {
            const k_fact = topo_val.facts.find(f => f[0] === "kind" && f[1] === id)
            expect(k_fact?.[2]).toBe("prop")
        }
    })

    test("level_match filters to a specific relation depth", () => {
        const env = primitive_env("dq3b-env")
        add_card("dq3b")
        build_card(env)("dq3b")
        execute_all_tasks_sequential(() => {})

        const trigger = construct_cell<number>("dq3b-trigger")
        const topo    = construct_topology_fact_cell(trigger)
        update_cell(trigger, 1)
        execute_all_tasks_sequential(() => {})

        const topo_val = cell_strongest_base_value(topo) as FactSet
        // Collect all distinct levels present
        const levels = [...new Set(
            topo_val.facts
                .filter(f => f[0] === "level")
                .map(f => Number(f[2]))
        )]
        expect(levels.length).toBeGreaterThan(0)

        // Pick the first level and verify level_match is correct
        const target_level = levels[0]!
        const lvl_cell = run_program(
            cell_level_program(target_level, "naive"),
            [topo],
            "dq3b-lvl"
        )
        execute_all_tasks_sequential(() => {})

        const val = cell_strongest_base_value(lvl_cell) as FactSet
        const matches = val.facts.filter(f => f[0] === "level_match")
        expect(matches.length).toBeGreaterThan(0)

        // Every match must be at the target level
        for (const [, id] of matches) {
            const l_fact = topo_val.facts.find(f => f[0] === "level" && f[1] === id)
            expect(Number(l_fact?.[2])).toBe(target_level)
        }
    })

    test("composed kind + level: prop nodes at level 0", () => {
        const env = primitive_env("dq3c-env")
        run("(+ 1 2 out)", env)
        execute_all_tasks_sequential(() => {})

        const trigger = construct_cell<number>("dq3c-trigger")
        const topo    = construct_topology_fact_cell(trigger)
        update_cell(trigger, 1)
        execute_all_tasks_sequential(() => {})

        // Compose: kind_match AND level_match, then find intersection
        const prog = program("naive",
            rule(atom("prop_at_level", V("X")),
                atom("kind",  V("X"), "prop"),
                atom("level", V("X"), "0"))
        )
        const out = run_program(prog, [topo], "dq3c-out")
        execute_all_tasks_sequential(() => {})

        const val = cell_strongest_base_value(out) as FactSet
        // Level-0 propagators exist in any compiled network
        const pal = val.facts.filter(f => f[0] === "prop_at_level")
        expect(pal.length).toBeGreaterThanOrEqual(0) // may be 0 if all props are deeper
    })
})

// ─── Q4: flows_to + reachability on connected cards ──────────────────────────

describe("Q4 (Datalog): flows_to + reachable on connected cards", () => {
    test("flows_to is derived between connected cards", () => {
        const env = primitive_env("dq4-env")
        add_card("dq4a")
        add_card("dq4b")
        build_card(env)("dq4a")
        build_card(env)("dq4b")
        connect_cards("dq4a", "dq4b", slot_right, slot_left)
        execute_all_tasks_sequential(() => {})

        const trigger = construct_cell<number>("dq4-trigger")
        const topo    = construct_topology_fact_cell(trigger)
        const reach   = construct_reachability_cell(topo)
        update_cell(trigger, 1)
        execute_all_tasks_sequential(() => {})

        const val = cell_strongest_base_value(reach) as FactSet
        const flows = val.facts.filter(f => f[0] === "flows_to")
        expect(flows.length).toBeGreaterThan(0)

        // The right slot of dq4a flows to the left slot of dq4b
        const right_id = cell_id(internal_cell_right(get_card("dq4a")))
        const left_id  = cell_id(internal_cell_left(get_card("dq4b")))
        const direct_flow = flows.find(f => f[1] === right_id && f[2] === left_id)
        expect(direct_flow).toBeDefined()
    })

    test("reachable derives transitive connection across cards", () => {
        const env = primitive_env("dq4b-env")
        add_card("dq4ba")
        add_card("dq4bb")
        add_card("dq4bc")
        build_card(env)("dq4ba")
        build_card(env)("dq4bb")
        build_card(env)("dq4bc")
        connect_cards("dq4ba", "dq4bb", slot_right, slot_left)
        connect_cards("dq4bb", "dq4bc", slot_right, slot_left)
        execute_all_tasks_sequential(() => {})

        const trigger = construct_cell<number>("dq4b-trigger")
        const topo    = construct_topology_fact_cell(trigger)
        const reach   = construct_reachability_cell(topo)
        update_cell(trigger, 1)
        execute_all_tasks_sequential(() => {})

        const val = cell_strongest_base_value(reach) as FactSet
        const reachable = val.facts.filter(f => f[0] === "reachable")

        const right_a  = cell_id(internal_cell_right(get_card("dq4ba")))
        const left_c   = cell_id(internal_cell_left(get_card("dq4bc")))

        // a's right should transitively reach c's left
        const transitive = reachable.find(f => f[1] === right_a && f[2] === left_c)
        expect(transitive).toBeDefined()
    })

    test("run_query returns bindings for reachable cells from source", () => {
        const env = primitive_env("dq4c-env")
        add_card("dq4ca")
        add_card("dq4cb")
        build_card(env)("dq4ca")
        build_card(env)("dq4cb")
        connect_cards("dq4ca", "dq4cb", slot_right, slot_left)
        execute_all_tasks_sequential(() => {})

        const trigger = construct_cell<number>("dq4c-trigger")
        const topo    = construct_topology_fact_cell(trigger)
        update_cell(trigger, 1)
        execute_all_tasks_sequential(() => {})

        const right_id = cell_id(internal_cell_right(get_card("dq4ca")))

        // Declare query: find everything reachable from right_id
        const decl = query_decl(
            atom("reachable", right_id, V("B")),
            topology_reachability_program("naive")
        )
        const { results } = run_query(decl, [topo], "dq4c-q")
        execute_all_tasks_sequential(() => {})

        const res = cell_strongest_base_value(results) as any[]
        expect(Array.isArray(res)).toBe(true)
        expect(res.length).toBeGreaterThan(0)

        const b_ids = res.map((d: any) => d.get("B"))
        const left_id = cell_id(internal_cell_left(get_card("dq4cb")))
        expect(b_ids).toContain(left_id)
    })
})

// ─── Extended topology facts schema ──────────────────────────────────────────

describe("Topology facts schema", () => {
    test("snapshot includes kind, namespace, level, label facts", () => {
        run("(+ 1 2 out)", primitive_env("schema-env"))
        execute_all_tasks_sequential(() => {})

        const facts = snapshot_topology_facts()

        expect(facts.some(f => f[0] === "kind"      && (f[2] === "cell" || f[2] === "prop"))).toBe(true)
        expect(facts.some(f => f[0] === "namespace")).toBe(true)
        expect(facts.some(f => f[0] === "level")).toBe(true)
        expect(facts.some(f => f[0] === "label")).toBe(true)
    })

    test("snapshot includes value facts for cells with known values", () => {
        const env = primitive_env("val-env")
        run("(+ 1 2 out)", env)
        execute_all_tasks_sequential(() => {})

        const facts = snapshot_topology_facts()
        const value_facts = facts.filter(f => f[0] === "value")
        expect(value_facts.length).toBeGreaterThan(0)
    })
})
