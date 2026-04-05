/**
 * Traced Graph ↔ MiniDatalog: same scenarios as graph_combinators_card.test.ts,
 * comparing graph_combinators outputs to LogicProgram results on traced_graph_to_facts EDB.
 */

import { expect, test, describe, beforeEach } from "bun:test"
import { DirectedGraph } from "graphology"
import {
    cell_strongest_base_value,
    cell_id,
    type Cell,
} from "ppropogator"
import { construct_cell, update_cell } from "ppropogator/Cell/Cell"
import { execute_all_tasks_sequential } from "ppropogator/Shared/Scheduler/Scheduler"

import {
    add_card,
    build_card,
    connect_cards,
    clear_card_metadata,
    guarantee_get_card_metadata,
    internal_cell_this,
    internal_cell_right,
    slot_right,
    slot_left,
} from "../src/grpc/card"
import { primitive_env } from "../compiler/closure"
import { init_system } from "../compiler/incremental_compiler"
import { run } from "../compiler/compiler_entry"

import { trace_upstream, trace_downstream } from "../compiler/tracer/generalized_tracer"
import {
    subgraph_by_kind,
    subgraph_by_namespace,
    subgraph_by_level,
    intersect_graphs,
    union_graphs,
    collapse_accessor_paths,
} from "../compiler/tracer/graph_combinators"

import { is_fact_set, type FactSet } from "../compiler/datalog/DatalogPropagator"
import {
    evaluate_traced_program,
    evaluate_trace_pair_program,
    node_ids_from_facts,
    traced_graph_to_facts,
    traced_namespace_program,
    traced_card_slot_cell_program,
    traced_kind_program,
    traced_level_program,
    traced_cell_at_level_program,
    traced_trace_pair_program,
    wire_traced_graph_datalog,
} from "../compiler/datalog/TracedGraphDatalog"

beforeEach(() => {
    init_system()
    clear_card_metadata()
})

const get_card = (id: string) => guarantee_get_card_metadata(id).card

const trace_and_get = (root: Cell<any>, name: string): DirectedGraph => {
    const gatherer = construct_cell(name)
    trace_upstream(root, gatherer)
    execute_all_tasks_sequential(() => {})
    return cell_strongest_base_value(gatherer) as DirectedGraph
}

const node_set = (g: DirectedGraph): Set<string> => new Set(g.nodes())

const expect_sets_equal = (a: Set<string>, b: Set<string>) => {
    expect(a.size).toBe(b.size)
    for (const id of a) expect(b.has(id)).toBe(true)
}

describe("TracedGraphDatalog Q1 vs subgraph_by_namespace / intersect", () => {
    test("ns_match agrees with subgraph_by_namespace(graph, '::')", () => {
        const env = primitive_env("tg-q1-env")
        add_card("tg-q1")
        build_card(env)("tg-q1")
        execute_all_tasks_sequential(() => {})

        const graph = trace_and_get(internal_cell_this(get_card("tg-q1")), "tg-q1-g")
        expect(graph.order).toBeGreaterThan(0)

        const comb = node_set(subgraph_by_namespace(graph, "::"))
        const facts = evaluate_traced_program(graph, traced_namespace_program("::"))
        const dl = node_ids_from_facts(facts, "ns_match")

        expect_sets_equal(comb, dl)
    })

    test("card_cell agrees with intersect namespace + kind cell", () => {
        const env = primitive_env("tg-q1c-env")
        add_card("tg-q1c")
        build_card(env)("tg-q1c")
        execute_all_tasks_sequential(() => {})

        const graph = trace_and_get(internal_cell_this(get_card("tg-q1c")), "tg-q1c-g")
        const comb = node_set(
            intersect_graphs(
                subgraph_by_namespace(graph, "::"),
                subgraph_by_kind(graph, "cell")
            )
        )
        const facts = evaluate_traced_program(graph, traced_card_slot_cell_program())
        const dl = node_ids_from_facts(facts, "card_cell")

        expect_sets_equal(comb, dl)
    })
})

describe("TracedGraphDatalog Q3 vs subgraph_by_kind / subgraph_by_level", () => {
    test("kind_match propagator agrees with subgraph_by_kind propagator", () => {
        const env = primitive_env("tg-q3-env")
        add_card("tg-q3")
        build_card(env)("tg-q3")
        execute_all_tasks_sequential(() => {})

        const graph = trace_and_get(internal_cell_this(get_card("tg-q3")), "tg-q3-g")
        const comb = node_set(subgraph_by_kind(graph, "propagator"))
        const facts = evaluate_traced_program(graph, traced_kind_program("propagator"))
        const dl = node_ids_from_facts(facts, "kind_match")

        expect_sets_equal(comb, dl)
    })

    test("level_match agrees with subgraph_by_level for each observed level", () => {
        const env = primitive_env("tg-q3b-env")
        add_card("tg-q3b")
        build_card(env)("tg-q3b")
        execute_all_tasks_sequential(() => {})

        const graph = trace_and_get(internal_cell_this(get_card("tg-q3b")), "tg-q3b-g")

        const levels = new Set<number>()
        graph.forEachNode((_, attrs) => {
            if (typeof attrs.relationLevel === "number") levels.add(attrs.relationLevel)
        })
        expect(levels.size).toBeGreaterThan(0)

        for (const level of levels) {
            const comb = node_set(subgraph_by_level(graph, level))
            const facts = evaluate_traced_program(graph, traced_level_program(level))
            const dl = node_ids_from_facts(facts, "level_match")
            expect_sets_equal(comb, dl)
        }
    })

    test("level_cell matches subgraph_by_level on cell-only subgraph", () => {
        const env = primitive_env("tg-q3c-env")
        run("(+ 1 2 tg-q3c-out)", env)
        execute_all_tasks_sequential(() => {})

        const envMap = cell_strongest_base_value(env) as Map<string, Cell<any>>
        const out = envMap.get("tg-q3c-out")!
        const graph = trace_and_get(out, "tg-q3c-g")

        const cells_graph = subgraph_by_kind(graph, "cell")
        const levels = new Set<number>()
        cells_graph.forEachNode((_, attrs) => {
            if (typeof attrs.relationLevel === "number") levels.add(attrs.relationLevel)
        })
        expect(levels.size).toBeGreaterThan(0)

        const target_level = [...levels][0]!
        const comb = node_set(subgraph_by_level(cells_graph, target_level))
        const facts = evaluate_traced_program(graph, traced_cell_at_level_program(target_level))
        const dl = node_ids_from_facts(facts, "level_cell")

        expect_sets_equal(comb, dl)
    })
})

describe("TracedGraphDatalog Q4 vs union_graphs / intersect_graphs node sets", () => {
    test("union_node / both_node match combinator node sets", () => {
        const env = primitive_env("tg-q4-env")
        add_card("tg-q4a")
        add_card("tg-q4b")
        build_card(env)("tg-q4a")
        build_card(env)("tg-q4b")
        connect_cards("tg-q4a", "tg-q4b", slot_right, slot_left)
        execute_all_tasks_sequential(() => {})

        const mid = internal_cell_right(get_card("tg-q4a"))

        const g_up = construct_cell("tg-q4-up")
        const g_down = construct_cell("tg-q4-down")
        trace_upstream(mid, g_up)
        trace_downstream(mid, g_down)
        execute_all_tasks_sequential(() => {})

        const up = cell_strongest_base_value(g_up) as DirectedGraph
        const down = cell_strongest_base_value(g_down) as DirectedGraph
        expect(up.order).toBeGreaterThan(0)
        expect(down.order).toBeGreaterThan(0)

        const prog = traced_trace_pair_program()
        const facts = evaluate_trace_pair_program(up, down, prog)

        const union_comb = node_set(union_graphs(up, down))
        const union_dl = node_ids_from_facts(facts, "union_node")
        expect_sets_equal(union_comb, union_dl)

        const both_comb = node_set(intersect_graphs(up, down))
        const both_dl = node_ids_from_facts(facts, "both_node")
        expect_sets_equal(both_comb, both_dl)
    })
})

describe("TracedGraphDatalog Q2 (collapsed graph) materialization", () => {
    test("after collapse_accessor_paths, no g_label fact uses Core|accessor prefix", () => {
        const env = primitive_env("tg-q2-env")
        run("(+ 1 2 tg-q2-out)", env)
        execute_all_tasks_sequential(() => {})

        const envMap = cell_strongest_base_value(env) as Map<string, Cell<any>>
        const out = envMap.get("tg-q2-out")!
        const graph = trace_and_get(out, "tg-q2-g")
        const collapsed = collapse_accessor_paths(graph)

        collapsed.forEachNode((_, attrs) => {
            expect(String(attrs.label ?? "").startsWith("Core|accessor")).toBe(false)
        })

        const facts = traced_graph_to_facts(collapsed)
        for (const f of facts) {
            if (f[0] === "g_label" && typeof f[2] === "string") {
                expect(f[2].startsWith("Core|accessor")).toBe(false)
            }
        }
    })
})

describe("TracedGraphDatalog Q5 g_value vs node attrs", () => {
    test("g_value facts align with graph value attributes on cells", () => {
        const env = primitive_env("tg-q5-env")
        add_card("tg-q5")
        build_card(env)("tg-q5")
        const card = get_card("tg-q5")
        execute_all_tasks_sequential(() => {})

        update_cell(internal_cell_this(card), 99)
        execute_all_tasks_sequential(() => {})

        const graph = trace_and_get(internal_cell_this(card), "tg-q5-g")
        const facts = traced_graph_to_facts(graph)

        const value_by_id = new Map<string, string>()
        for (const f of facts) {
            if (f[0] === "g_value" && f.length >= 3 && typeof f[1] === "string") {
                value_by_id.set(f[1], String(f[2]))
            }
        }

        graph.forEachNode((id, attrs) => {
            const v = graph.getNodeAttribute(id, "value")
            if (v !== undefined) {
                expect(value_by_id.get(id)).toBe(String(v))
            }
        })

        const this_id = cell_id(internal_cell_this(card))
        expect(value_by_id.get(this_id)).toBe("99")
    })
})

describe("TracedGraphDatalog propagator wiring", () => {
    test("wire_traced_graph_datalog fills derived FactSet matching evaluate_traced_program", () => {
        const env = primitive_env("tg-prop-env")
        add_card("tg-prop")
        build_card(env)("tg-prop")
        execute_all_tasks_sequential(() => {})

        const graph = trace_and_get(internal_cell_this(get_card("tg-prop")), "tg-prop-g")
        const prog = traced_namespace_program("::")

        const sync_facts = evaluate_traced_program(graph, prog)
        const { derived } = wire_traced_graph_datalog(graph, prog, "tg_wire")

        const val = cell_strongest_base_value(derived)
        expect(is_fact_set(val)).toBe(true)
        if (!is_fact_set(val)) return
        const derived_fs = val as FactSet

        const sync_ns = node_ids_from_facts(sync_facts, "ns_match").size
        const prop_ns = node_ids_from_facts(derived_fs.facts, "ns_match").size
        expect(prop_ns).toBe(sync_ns)
    })
})
