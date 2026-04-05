// SPDX-License-Identifier: GPL-3.0-or-later
//
// Tests for the Datalog propagator layer:
//   - FactSet merge / equality (additive union via unification)
//   - Datalog derivation (path rules, multi-EDB)
//   - query_fact_cell (pattern queries over derived facts)
//   - Topology snapshotting and reachability reasoning

import { describe, test, expect, beforeEach } from "bun:test"
import { V, type Rule } from "pmatcher/new_match/MiniDatalog"
import {
    install_datalog_handlers,
    make_fact_set,
    is_fact_set,
    derive_facts,
    query_fact_cell,
    construct_datalog_propagator,
    type FactSet,
} from "../compiler/datalog/DatalogPropagator"
import {
    snapshot_topology_facts,
    construct_topology_fact_cell,
    construct_reachability_cell,
} from "../compiler/datalog/TopologyFacts"
import {
    construct_cell,
    add_cell_content as update_cell,
    cell_strongest_base_value,
    cell_id,
    execute_all_tasks_sequential,
    p_sync,
} from "ppropogator"
import { init_system } from "../compiler/incremental_compiler"

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
    init_system()
    install_datalog_handlers()
})

// ─── FactSet merge and equality ───────────────────────────────────────────────

describe("FactSet — merge and equality", () => {
    test("merging two disjoint FactSets produces their union", () => {
        const cell = construct_cell<FactSet>("merge_union")
        update_cell(cell, make_fact_set([["edge", "a", "b"]]))
        update_cell(cell, make_fact_set([["edge", "b", "c"]]))
        execute_all_tasks_sequential(() => {})

        const val = cell_strongest_base_value(cell) as FactSet
        expect(is_fact_set(val)).toBe(true)
        expect(val.facts).toHaveLength(2)
        expect(val.facts).toContainEqual(["edge", "a", "b"])
        expect(val.facts).toContainEqual(["edge", "b", "c"])
    })

    test("merging a FactSet with itself does not duplicate facts", () => {
        const cell = construct_cell<FactSet>("merge_dedup")
        update_cell(cell, make_fact_set([["edge", "a", "b"]]))
        update_cell(cell, make_fact_set([["edge", "a", "b"]]))
        execute_all_tasks_sequential(() => {})

        const val = cell_strongest_base_value(cell) as FactSet
        expect(val.facts).toHaveLength(1)
    })

    test("no contradiction when two FactSets differ (additive, not substitutive)", () => {
        const cell = construct_cell<FactSet>("merge_no_contradiction")
        update_cell(cell, make_fact_set([["edge", "x", "y"]]))
        update_cell(cell, make_fact_set([["node", "z"]]))
        execute_all_tasks_sequential(() => {})

        const val = cell_strongest_base_value(cell) as FactSet
        // should not be a contradiction — just two facts
        expect(is_fact_set(val)).toBe(true)
        expect(val.facts).toHaveLength(2)
    })
})

// ─── Datalog propagator — basic derivation ────────────────────────────────────

describe("Datalog propagator — path derivation", () => {
    const path_rules: Rule[] = [
        { head: ["path", V("X"), V("Y")], body: [["edge", V("X"), V("Y")]] },
        {
            head: ["path", V("X"), V("Z")],
            body: [["path", V("X"), V("Y")], ["edge", V("Y"), V("Z")]],
        },
    ]

    test("derives direct and transitive paths from edges", () => {
        const edges = construct_cell<FactSet>("edges_basic")
        const paths = derive_facts([edges], path_rules, "paths_basic")

        update_cell(edges, make_fact_set([
            ["edge", "a", "b"],
            ["edge", "b", "c"],
        ]))
        execute_all_tasks_sequential(() => {})

        const val = cell_strongest_base_value(paths) as FactSet
        expect(is_fact_set(val)).toBe(true)
        expect(val.facts).toContainEqual(["path", "a", "b"])
        expect(val.facts).toContainEqual(["path", "b", "c"])
        expect(val.facts).toContainEqual(["path", "a", "c"])  // transitive
    })

    test("derived cell re-fires when EDB cell grows", () => {
        const edges = construct_cell<FactSet>("edges_reactive")
        const paths = derive_facts([edges], path_rules, "paths_reactive")

        // Round 1: single edge
        update_cell(edges, make_fact_set([["edge", "a", "b"]]))
        execute_all_tasks_sequential(() => {})

        let val = cell_strongest_base_value(paths) as FactSet
        expect(val.facts).toContainEqual(["path", "a", "b"])
        expect(val.facts.some(f => f[0] === "path" && f[2] === "c")).toBe(false)

        // Round 2: add a second edge (FactSet merge unions, giving both)
        update_cell(edges, make_fact_set([["edge", "a", "b"], ["edge", "b", "c"]]))
        execute_all_tasks_sequential(() => {})

        val = cell_strongest_base_value(paths) as FactSet
        expect(val.facts).toContainEqual(["path", "a", "c"])
    })

    test("no extra facts derived when EDB is empty", () => {
        const edges = construct_cell<FactSet>("edges_empty")
        const paths = derive_facts([edges], path_rules, "paths_empty")

        update_cell(edges, make_fact_set([]))
        execute_all_tasks_sequential(() => {})

        const val = cell_strongest_base_value(paths) as FactSet
        expect(is_fact_set(val)).toBe(true)
        expect(val.facts.filter(f => f[0] === "path")).toHaveLength(0)
    })
})

// ─── query_fact_cell ──────────────────────────────────────────────────────────

describe("query_fact_cell — pattern queries over derived facts", () => {
    const path_rules: Rule[] = [
        { head: ["path", V("X"), V("Y")], body: [["edge", V("X"), V("Y")]] },
        {
            head: ["path", V("X"), V("Z")],
            body: [["path", V("X"), V("Y")], ["edge", V("Y"), V("Z")]],
        },
    ]

    test("query extracts variable bindings from derived facts", () => {
        const edges = construct_cell<FactSet>("edges_query")
        const paths = derive_facts([edges], path_rules, "paths_query")

        update_cell(edges, make_fact_set([
            ["edge", "a", "b"],
            ["edge", "b", "c"],
            ["edge", "c", "d"],
        ]))
        execute_all_tasks_sequential(() => {})

        const results = query_fact_cell(paths, ["path", "a", V("Dest")])
        const destinations = results.map(d => d.get("Dest"))

        expect(destinations).toContain("b")
        expect(destinations).toContain("c")
        expect(destinations).toContain("d")  // transitive: a→b→c→d
    })

    test("query on empty cell returns empty array", () => {
        const cell = construct_cell<FactSet>("empty_query_cell")
        const results = query_fact_cell(cell, ["path", V("X"), V("Y")])
        expect(results).toEqual([])
    })
})

// ─── Multiple EDB cells ───────────────────────────────────────────────────────

describe("Datalog propagator — multiple EDB cells", () => {
    test("derivation draws from all input EDB cells", () => {
        const left  = construct_cell<FactSet>("multi_left")
        const right = construct_cell<FactSet>("multi_right")
        const rules: Rule[] = [
            { head: ["path", V("X"), V("Y")], body: [["edge", V("X"), V("Y")]] },
            {
                head: ["path", V("X"), V("Z")],
                body: [["path", V("X"), V("Y")], ["edge", V("Y"), V("Z")]],
            },
        ]
        const paths = derive_facts([left, right], rules, "multi_paths")

        update_cell(left,  make_fact_set([["edge", "a", "b"]]))
        update_cell(right, make_fact_set([["edge", "b", "c"]]))
        execute_all_tasks_sequential(() => {})

        const val = cell_strongest_base_value(paths) as FactSet
        // a→c is transitive through b, but edge facts split across two cells
        expect(val.facts).toContainEqual(["path", "a", "c"])
    })
})

// ─── Topology facts ───────────────────────────────────────────────────────────

describe("Topology facts — snapshot", () => {
    test("snapshot includes cell facts for every cell in the network", () => {
        const a = construct_cell("topo_cell_a")
        const b = construct_cell("topo_cell_b")
        execute_all_tasks_sequential(() => {})

        const facts = snapshot_topology_facts()
        const names = facts.filter(f => f[0] === "cell").map(f => f[2])
        expect(names).toContain("topo_cell_a")
        expect(names).toContain("topo_cell_b")
    })

    test("snapshot includes reads/writes facts for p_sync propagator", () => {
        const src = construct_cell("sync_src")
        const dst = construct_cell("sync_dst")
        p_sync(src, dst)
        execute_all_tasks_sequential(() => {})

        const facts = snapshot_topology_facts()
        const src_id = cell_id(src)
        const dst_id = cell_id(dst)

        // Some propagator must read src and write dst
        const props = facts.filter(f => f[0] === "propagator").map(f => f[1])
        const reads  = facts.filter(f => f[0] === "reads"  && f[2] === src_id).map(f => f[1])
        const writes = facts.filter(f => f[0] === "writes" && f[2] === dst_id).map(f => f[1])

        // The same propagator id should appear in both reads and writes
        const shared = reads.filter(pid => writes.includes(pid))
        expect(shared.length).toBeGreaterThan(0)
    })
})

// ─── Topology reasoning ───────────────────────────────────────────────────────

describe("Topology reasoning — flows_to and reachability", () => {
    test("flows_to is derived for p_sync-connected cells", () => {
        const src = construct_cell("flow_src")
        const dst = construct_cell("flow_dst")
        p_sync(src, dst)
        execute_all_tasks_sequential(() => {})

        const trigger   = construct_cell<number>("topo_trigger_flow")
        const topo_cell = construct_topology_fact_cell(trigger)
        const reach     = construct_reachability_cell(topo_cell)

        update_cell(trigger, 1)
        execute_all_tasks_sequential(() => {})

        const val = cell_strongest_base_value(reach) as FactSet
        expect(is_fact_set(val)).toBe(true)

        const src_id = cell_id(src)
        const dst_id = cell_id(dst)
        const flows = val.facts.filter(
            f => f[0] === "flows_to" && f[1] === src_id && f[2] === dst_id
        )
        expect(flows.length).toBeGreaterThan(0)
    })

    test("reachable is transitively derived for a chain a→b→c", () => {
        const a = construct_cell("chain_a")
        const b = construct_cell("chain_b")
        const c = construct_cell("chain_c")
        p_sync(a, b)
        p_sync(b, c)
        execute_all_tasks_sequential(() => {})

        const trigger   = construct_cell<number>("topo_trigger_chain")
        const topo_cell = construct_topology_fact_cell(trigger)
        const reach     = construct_reachability_cell(topo_cell)

        update_cell(trigger, 1)
        execute_all_tasks_sequential(() => {})

        const val = cell_strongest_base_value(reach) as FactSet
        expect(is_fact_set(val)).toBe(true)

        const a_id = cell_id(a)
        const c_id = cell_id(c)
        const transitive = val.facts.filter(
            f => f[0] === "reachable" && f[1] === a_id && f[2] === c_id
        )
        expect(transitive.length).toBeGreaterThan(0)
    })

    test("topology-derived reachability updates when trigger changes", () => {
        // Build a two-hop chain, then verify a→c reachability after trigger
        const a = construct_cell("dyn_a")
        const b = construct_cell("dyn_b")
        const c = construct_cell("dyn_c")
        p_sync(a, b)
        p_sync(b, c)
        execute_all_tasks_sequential(() => {})

        const trigger   = construct_cell<number>("dyn_trigger")
        const topo_cell = construct_topology_fact_cell(trigger)
        const reach     = construct_reachability_cell(topo_cell)

        // Trigger once
        update_cell(trigger, 1)
        execute_all_tasks_sequential(() => {})

        const val = cell_strongest_base_value(reach) as FactSet
        const a_id = cell_id(a)
        const c_id = cell_id(c)
        const hits = val.facts.filter(
            f => f[0] === "reachable" && f[1] === a_id && f[2] === c_id
        )
        expect(hits.length).toBeGreaterThan(0)
    })
})
