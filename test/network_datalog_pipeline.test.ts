// SPDX-License-Identifier: GPL-3.0-or-later
//
// NetworkDatalogPipeline — propagator chain: topology snapshot → program → q_row projection.

import { describe, test, expect, beforeEach } from "bun:test"
import { DirectedGraph } from "graphology"
import {
    add_cell_content as update_cell,
    construct_cell,
    cell_strongest_base_value,
    execute_all_tasks_sequential,
} from "ppropogator"
import { cell_id } from "ppropogator/Cell/Cell"
import { find_cell_by_id, find_propagator_by_id } from "ppropogator/Shared/GraphTraversal"

import {
    add_card,
    build_card,
    clear_card_metadata,
} from "../src/grpc/card"
import { primitive_env } from "../compiler/closure"
import { init_system } from "../compiler/incremental_compiler"
import { run } from "../compiler/compiler_entry"

import type { Fact } from "pmatcher/new_match/MiniDatalog"
import {
    install_datalog_handlers,
    make_fact_set,
    is_fact_set,
    type FactSet,
} from "../compiler/datalog/DatalogPropagator"
import {
    cell_namespace_program,
    snapshot_topology_facts,
    topology_reachability_program,
} from "../compiler/datalog/TopologyFacts"
import {
    graphology_from_topology_facts,
    entity_ids_from_q_row_facts,
    resolve_network_ids,
    construct_topology_filtered_graph_propagator,
    decode_q_row,
} from "../compiler/datalog/NetworkTopologyGraphology"
import { V, atom, rule, program } from "../compiler/datalog/LogicProgram"
import {
    wire_topology_snapshot_cell,
    wire_topology_datalog_pipeline,
    wire_sequential_programs,
    construct_grounded_query_propagator,
} from "../compiler/datalog/NetworkDatalogPipeline"
import { topology_path3_program } from "../compiler/datalog/TopologyPathPrograms"
import {
    topology_mutual_reach_program,
    topology_triad_surface_program,
    topology_triad_one_way_surface_program,
} from "../compiler/datalog/TopologyOrientationPrograms"

beforeEach(() => {
    init_system()
    clear_card_metadata()
    install_datalog_handlers()
})

/** `p_add` is `primitive_propagator(..., "+")` — snapshot uses that name on the propagator row. */
const pickPlusPropagatorId = (facts: readonly Fact[]): string | undefined => {
    const plusRows = facts.filter(
        f =>
            f[0] === "propagator" &&
            typeof f[1] === "string" &&
            typeof f[2] === "string" &&
            f[2] === "+"
    )
    const scored = plusRows.map(f => {
        const id = f[1] as string
        const nRead = facts.filter(r => r[0] === "reads" && r[1] === id).length
        const nWrite = facts.filter(r => r[0] === "writes" && r[1] === id).length
        return { id, nRead, nWrite }
    })
    const binary = scored.find(s => s.nRead === 2 && s.nWrite === 1)
    return binary?.id ?? scored[0]?.id
}

/** For `reads` / `writes` q_rows, args are `[propId, cellId]`. */
const cellIdsFromQRows = (facts: Fact[], pred: "reads" | "writes", propId: string): Set<string> => {
    const out = new Set<string>()
    for (const f of facts) {
        const d = decode_q_row(f)
        if (!d || d.pred !== pred || d.args[0] !== propId) continue
        const cellId = d.args[1]
        if (typeof cellId === "string") out.add(cellId)
    }
    return out
}

/** Unary derived preds → single cell id per `q_row` (e.g. `plus_read`). */
const cellIdsFromUnaryQPred = (facts: Fact[], pred: string): Set<string> => {
    const out = new Set<string>()
    for (const f of facts) {
        const d = decode_q_row(f)
        if (!d || d.pred !== pred || d.args.length < 1) continue
        const id = d.args[0]
        if (typeof id === "string") out.add(id)
    }
    return out
}

/**
 * Neighbor cells of any propagator whose snapshot name is "+" (p_add).
 * Joins on `propagator(P, "+")` — no propagator id in the query pattern.
 */
const programPlusNeighborsByName = () =>
    program(
        "semi-naive",
        rule(
            atom("plus_read", V("C")),
            atom("reads", V("P"), V("C")),
            atom("propagator", V("P"), "+")
        ),
        rule(
            atom("plus_write", V("C")),
            atom("writes", V("P"), V("C")),
            atom("propagator", V("P"), "+")
        )
    )

/**
 * Three distinct cell ids spread across the sorted id list (deterministic, not
 * `Math.random` — stable in CI). Acts as a cheap “sample three cells” probe.
 */
const pickThreeSpreadCellIds = (facts: Fact[]): [string, string, string] | undefined => {
    const ids = [
        ...new Set(
            facts
                .filter(f => f[0] === "cell" && typeof f[1] === "string")
                .map(f => f[1] as string)
        ),
    ].sort((a, b) => a.localeCompare(b))
    if (ids.length < 3) return undefined
    return [ids[0]!, ids[Math.floor(ids.length / 2)]!, ids[ids.length - 1]!]
}

const flowsToAdjacency = (facts: Fact[]): Map<string, Set<string>> => {
    const m = new Map<string, Set<string>>()
    for (const f of facts) {
        if (
            f[0] === "flows_to" &&
            typeof f[1] === "string" &&
            typeof f[2] === "string"
        ) {
            if (!m.has(f[1])) m.set(f[1], new Set())
            m.get(f[1])!.add(f[2])
        }
    }
    return m
}

const bfsReachOnAdj = (adj: Map<string, Set<string>>, from: string, to: string): boolean => {
    if (from === to) return true
    const seen = new Set<string>([from])
    const queue = [from]
    while (queue.length > 0) {
        const x = queue.shift()!
        for (const y of adj.get(x) ?? []) {
            if (y === to) return true
            if (!seen.has(y)) {
                seen.add(y)
                queue.push(y)
            }
        }
    }
    return false
}

const hasReachableFact = (facts: Fact[], from: string, to: string): boolean =>
    facts.some(f => f[0] === "reachable" && f[1] === from && f[2] === to)

const hasSurfaceDirFact = (facts: Fact[], from: string, to: string): boolean =>
    facts.some(f => f[0] === "surface_dir" && f[1] === from && f[2] === to)

const hasSurfaceMutualFact = (facts: Fact[], x: string, y: string): boolean =>
    facts.some(f => f[0] === "surface_mutual" && f[1] === x && f[2] === y)

const hasSurfaceOneWayFact = (facts: Fact[], from: string, to: string): boolean =>
    facts.some(f => f[0] === "surface_one_way" && f[1] === from && f[2] === to)

describe("NetworkDatalogPipeline — topology snapshot cell", () => {
    test("wire_topology_snapshot_cell refreshes FactSet when trigger updates", () => {
        const env = primitive_env("ndp-snap-env")
        add_card("ndp-snap")
        build_card(env)("ndp-snap")
        execute_all_tasks_sequential(() => {})

        const trigger = construct_cell<number>("ndp-snap-trig")
        const topo = wire_topology_snapshot_cell(trigger, "ndp_snap")

        update_cell(trigger, 1)
        execute_all_tasks_sequential(() => {})

        const val = cell_strongest_base_value(topo)
        expect(is_fact_set(val)).toBe(true)
        if (!is_fact_set(val)) return
        const topoFs = val as FactSet
        expect(topoFs.facts.some(f => f[0] === "cell")).toBe(true)
    })
})

describe("NetworkDatalogPipeline — full topology → program pipeline", () => {
    test("wire_topology_datalog_pipeline derives ns_match (Core) after compile footprint", () => {
        const env = primitive_env("ndp-pipe-env")
        run("(+ 1 2 ndp-pipe-out)", env)
        execute_all_tasks_sequential(() => {})

        const trigger = construct_cell<number>("ndp-pipe-trig")
        const { derived } = wire_topology_datalog_pipeline(
            trigger,
            cell_namespace_program("Core", "naive"),
            "ndp_pipe"
        )

        update_cell(trigger, 1)
        execute_all_tasks_sequential(() => {})

        const val = cell_strongest_base_value(derived)
        expect(is_fact_set(val)).toBe(true)
        if (!is_fact_set(val)) return
        const derivedFs = val as FactSet
        const matches = derivedFs.facts.filter(f => f[0] === "ns_match")
        expect(matches.length).toBeGreaterThan(0)
    })
})

describe("NetworkDatalogPipeline — sequential programs", () => {
    test("wire_sequential_programs chains IDB through stages", () => {
        const edb = construct_cell<FactSet>("ndp-seq-edb")
        const p1 = program(
            "semi-naive",
            rule(atom("path", V("X"), V("Y")), atom("edge", V("X"), V("Y"))),
            rule(
                atom("path", V("X"), V("Z")),
                atom("path", V("X"), V("Y")),
                atom("edge", V("Y"), V("Z"))
            )
        )
        const p2 = program(
            "semi-naive",
            rule(atom("echo", V("X"), V("Y")), atom("path", V("X"), V("Y")))
        )

        const [stage1, stage2] = wire_sequential_programs(edb, [p1, p2], "ndp_seq")

        update_cell(edb, make_fact_set([["edge", "a", "b"], ["edge", "b", "c"]]))
        execute_all_tasks_sequential(() => {})

        const v2 = cell_strongest_base_value(stage2) as FactSet
        expect(is_fact_set(v2)).toBe(true)
        expect(v2.facts).toContainEqual(["echo", "a", "c"])
    })
})

describe("NetworkDatalogPipeline — grounded query propagator", () => {
    test("construct_grounded_query_propagator emits q_row facts for each binding", () => {
        const edb = construct_cell<FactSet>("ndp-q-edb")
        const path_prog = program(
            "semi-naive",
            rule(atom("path", V("X"), V("Y")), atom("edge", V("X"), V("Y"))),
            rule(
                atom("path", V("X"), V("Z")),
                atom("path", V("X"), V("Y")),
                atom("edge", V("Y"), V("Z"))
            )
        )
        const derived = wire_sequential_programs(edb, [path_prog], "ndp_q_path")[0]!
        const answers = construct_cell<FactSet>("ndp-q-ans")
        construct_grounded_query_propagator(
            derived,
            ["path", V("X"), V("Y")],
            answers,
            "ndp_q_proj"
        )

        update_cell(edb, make_fact_set([["edge", "a", "b"], ["edge", "b", "c"]]))
        execute_all_tasks_sequential(() => {})

        const val = cell_strongest_base_value(answers) as FactSet
        expect(is_fact_set(val)).toBe(true)
        expect(val.facts).toContainEqual(["q_row", "path", "a", "b"])
        expect(val.facts).toContainEqual(["q_row", "path", "a", "c"])
    })

    test("snapshot pipeline + grounded query projects ns_match rows", () => {
        const env = primitive_env("ndp-e2e-env")
        run("(+ 1 2 ndp-e2e-out)", env)
        execute_all_tasks_sequential(() => {})

        const trigger = construct_cell<number>("ndp-e2e-trig")
        const ns_prog = cell_namespace_program("Core", "naive")
        const { derived } = wire_topology_datalog_pipeline(trigger, ns_prog, "ndp_e2e")

        const answers = construct_cell<FactSet>("ndp-e2e-ans")
        construct_grounded_query_propagator(
            derived,
            ["ns_match", V("N")],
            answers,
            "ndp_e2e_q"
        )

        update_cell(trigger, 1)
        execute_all_tasks_sequential(() => {})

        const val = cell_strongest_base_value(answers) as FactSet
        expect(is_fact_set(val)).toBe(true)
        const rows = val.facts.filter(f => f[0] === "q_row")
        expect(rows.length).toBeGreaterThan(0)
        for (const row of rows) {
            expect(row[0]).toBe("q_row")
            expect(row[1]).toBe("ns_match")
            expect(typeof row[2]).toBe("string")
        }
    })
})

describe("NetworkTopologyGraphology — ids → graphology + live handles", () => {
    test("graphology_from_topology_facts builds edges reads/writes among kept ids", () => {
        const facts = [
            ["cell", "c1", "cell-a"],
            ["kind", "c1", "cell"],
            ["namespace", "c1", "Core"],
            ["level", "c1", "1"],
            ["label", "c1", "cell-a"],
            ["propagator", "p1", "prop-a"],
            ["kind", "p1", "prop"],
            ["namespace", "p1", "Core"],
            ["level", "p1", "2"],
            ["label", "p1", "prop-a"],
            ["cell", "c2", "cell-b"],
            ["kind", "c2", "cell"],
            ["namespace", "c2", "Core"],
            ["level", "c2", "1"],
            ["label", "c2", "cell-b"],
            ["reads", "p1", "c1"],
            ["writes", "p1", "c2"],
        ] as const
        const keep = new Set<string>(["c1", "p1", "c2"])
        const g = graphology_from_topology_facts([...facts] as any[], keep)

        expect(g.hasNode("c1")).toBe(true)
        expect(g.hasNode("p1")).toBe(true)
        expect(g.hasNode("c2")).toBe(true)
        expect(g.hasEdge("c1", "p1")).toBe(true)
        expect(g.hasEdge("p1", "c2")).toBe(true)
        expect(g.getNodeAttribute("p1", "kind")).toBe("propagator")
        expect(g.getNodeAttribute("c1", "kind")).toBe("cell")
    })

    test("entity_ids_from_q_row_facts collects string args after predicate", () => {
        const ids = entity_ids_from_q_row_facts([
            ["q_row", "ns_match", "n1"],
            ["q_row", "ns_match", "n2"],
            ["q_row", "flows_to", "a", "b"],
        ] as any[])
        expect(ids.has("n1")).toBe(true)
        expect(ids.has("n2")).toBe(true)
        expect(ids.has("a")).toBe(true)
        expect(ids.has("b")).toBe(true)
    })

    test("resolve_network_ids finds live cells for snapshot cell ids", () => {
        const env = primitive_env("ndp-res-env")
        add_card("ndp-res")
        build_card(env)("ndp-res")
        execute_all_tasks_sequential(() => {})

        const topoIds = snapshot_topology_facts()
            .filter(f => f[0] === "cell" && typeof f[1] === "string")
            .map(f => f[1] as string)
        expect(topoIds.length).toBeGreaterThan(0)

        const picked = topoIds.slice(0, 3)
        const { cells, propagators, unresolved } = resolve_network_ids(picked)
        expect(cells.length + propagators.length + unresolved.length).toBe(picked.length)
        expect(cells.length).toBeGreaterThan(0)
    })

    test("construct_topology_filtered_graph_propagator wires topo + q_row → DirectedGraph", () => {
        const env = primitive_env("ndp-graph-env")
        run("(+ 1 2 ndp-graph-out)", env)
        execute_all_tasks_sequential(() => {})

        const trigger = construct_cell<number>("ndp-graph-trig")
        const ns_prog = cell_namespace_program("Core", "naive")
        const { topo, derived } = wire_topology_datalog_pipeline(trigger, ns_prog, "ndp_graph")

        const answers = construct_cell<FactSet>("ndp-graph-ans")
        construct_grounded_query_propagator(
            derived,
            ["ns_match", V("N")],
            answers,
            "ndp_graph_q"
        )

        const graphCell = construct_cell<DirectedGraph>("ndp-graph-out-graph")
        construct_topology_filtered_graph_propagator(topo, answers, graphCell, "ndp_graph_g")

        update_cell(trigger, 1)
        execute_all_tasks_sequential(() => {})

        const g = cell_strongest_base_value(graphCell) as DirectedGraph
        expect(g).toBeInstanceOf(DirectedGraph)
        expect(g.order).toBeGreaterThan(0)
    })
})

describe("Topology reachability — three spread cells, direction & disconnection", () => {
    test("reachable matches BFS on flows_to for six directed pairs (who reaches whom)", () => {
        const env = primitive_env("tri-reach-env")
        run("(+ 1 2 tri-reach-out)", env)
        execute_all_tasks_sequential(() => {})

        const trigger = construct_cell<number>("tri-reach-trig")
        const { derived } = wire_topology_datalog_pipeline(
            trigger,
            topology_reachability_program("naive"),
            "tri_reach"
        )

        update_cell(trigger, 1)
        execute_all_tasks_sequential(() => {})

        const dVal = cell_strongest_base_value(derived)
        expect(is_fact_set(dVal)).toBe(true)
        if (!is_fact_set(dVal)) return
        const dFacts = (dVal as FactSet).facts

        expect(dFacts.some(f => f[0] === "flows_to")).toBe(true)
        expect(dFacts.some(f => f[0] === "reachable")).toBe(true)

        const trio = pickThreeSpreadCellIds(dFacts)
        expect(trio).toBeDefined()
        if (!trio) return
        const [c0, c1, c2] = trio
        expect(new Set([c0, c1, c2]).size).toBe(3)

        const adj = flowsToAdjacency(dFacts)
        const directedPairs: [string, string][] = [
            [c0, c1],
            [c1, c0],
            [c0, c2],
            [c2, c0],
            [c1, c2],
            [c2, c1],
        ]

        for (const [a, b] of directedPairs) {
            const fromDatalog = hasReachableFact(dFacts, a, b)
            const fromBfs = bfsReachOnAdj(adj, a, b)
            expect(fromDatalog).toBe(fromBfs)
        }
        // Interpretation per unordered pair {x,y}: compare hasReachableFact(x,y) vs hasReachableFact(y,x)
        // → both true (same SCC), one true (directional), neither (disconnected that way).
    })

    test("triad surface_dir / surface_mutual mirror reachable + mutual_reach (datalog-only summary)", () => {
        const env = primitive_env("tri-surf-env")
        run("(+ 1 2 tri-surf-out)", env)
        execute_all_tasks_sequential(() => {})

        const trio = pickThreeSpreadCellIds(snapshot_topology_facts())
        expect(trio).toBeDefined()
        if (!trio) return
        const [c0, c1, c2] = trio

        const trigger = construct_cell<number>("tri-surf-trig")
        const prog = topology_triad_surface_program(c0, c1, c2, "naive")
        const { derived } = wire_topology_datalog_pipeline(trigger, prog, "tri_surf")

        update_cell(trigger, 1)
        execute_all_tasks_sequential(() => {})

        const dVal = cell_strongest_base_value(derived)
        expect(is_fact_set(dVal)).toBe(true)
        if (!is_fact_set(dVal)) return
        const dFacts = (dVal as FactSet).facts

        const directedPairs: [string, string][] = [
            [c0, c1],
            [c1, c0],
            [c0, c2],
            [c2, c0],
            [c1, c2],
            [c2, c1],
        ]
        for (const [x, y] of directedPairs) {
            expect(hasSurfaceDirFact(dFacts, x, y)).toBe(hasReachableFact(dFacts, x, y))
        }

        const undirected: [string, string][] = [
            [c0, c1],
            [c0, c2],
            [c1, c2],
        ]
        for (const [x, y] of undirected) {
            const mutual =
                hasReachableFact(dFacts, x, y) && hasReachableFact(dFacts, y, x)
            expect(hasSurfaceMutualFact(dFacts, x, y)).toBe(mutual)
            expect(hasSurfaceMutualFact(dFacts, y, x)).toBe(mutual)
        }
    })

    test("sequential stage: NegFact yields surface_one_way iff asymmetric reach among triad", () => {
        const env = primitive_env("tri-neg-env")
        run("(+ 1 2 tri-neg-out)", env)
        execute_all_tasks_sequential(() => {})

        const trio = pickThreeSpreadCellIds(snapshot_topology_facts())
        expect(trio).toBeDefined()
        if (!trio) return
        const [c0, c1, c2] = trio

        const trigger = construct_cell<number>("tri-neg-trig")
        const topo = wire_topology_snapshot_cell(trigger, "tri_neg_topo")
        const [, finalStage] = wire_sequential_programs(
            topo,
            [
                topology_mutual_reach_program("naive"),
                topology_triad_one_way_surface_program(c0, c1, c2, "naive"),
            ],
            "tri_neg_seq"
        )

        update_cell(trigger, 1)
        execute_all_tasks_sequential(() => {})

        const dVal = cell_strongest_base_value(finalStage)
        expect(is_fact_set(dVal)).toBe(true)
        if (!is_fact_set(dVal)) return
        const dFacts = (dVal as FactSet).facts

        const directedPairs: [string, string][] = [
            [c0, c1],
            [c1, c0],
            [c0, c2],
            [c2, c0],
            [c1, c2],
            [c2, c1],
        ]
        for (const [x, y] of directedPairs) {
            const asymmetric =
                hasReachableFact(dFacts, x, y) && !hasReachableFact(dFacts, y, x)
            expect(hasSurfaceOneWayFact(dFacts, x, y)).toBe(asymmetric)
        }
    })
})

describe("TopologyPathPrograms — explicit paths (bounded depth)", () => {
    test("path3 program derives hop (and usually path2/path3) over reads/writes topology", () => {
        const env = primitive_env("tp-path-env")
        run("(+ 1 2 tp-path-out)", env)
        execute_all_tasks_sequential(() => {})

        const trigger = construct_cell<number>("tp-path-trig")
        const { derived } = wire_topology_datalog_pipeline(
            trigger,
            topology_path3_program(),
            "tp_path"
        )

        update_cell(trigger, 1)
        execute_all_tasks_sequential(() => {})

        const dVal = cell_strongest_base_value(derived)
        expect(is_fact_set(dVal)).toBe(true)
        if (!is_fact_set(dVal)) return
        const df = dVal as FactSet

        expect(df.facts.some(f => f[0] === "hop")).toBe(true)
        const nHop = df.facts.filter(f => f[0] === "hop").length
        expect(nHop).toBeGreaterThan(0)
        // (+ 1 2 out) network is deeper than one hop end-to-end; path2/path3 may exist
        const n2 = df.facts.filter(f => f[0] === "path2").length
        const n3 = df.facts.filter(f => f[0] === "path3").length
        expect(n2 + n3).toBeGreaterThan(0)
    })
})

describe("End-to-end: `+` primitive (p_add) — topology query matches reads/writes", () => {
    test("neighbors of propagator named '+' via datalog join (no prop id in query pattern)", () => {
        const env = primitive_env("add-plus-env")
        run("(+ 1 2 add-plus-out)", env)
        execute_all_tasks_sequential(() => {})

        const envMap = cell_strongest_base_value(env) as Map<string, any>
        const out = envMap.get("add-plus-out")!
        const outId = cell_id(out)

        const facts = snapshot_topology_facts()
        const addId = pickPlusPropagatorId(facts)
        expect(addId).toBeDefined()
        if (addId === undefined) return

        const addProp = find_propagator_by_id(addId)
        expect(addProp).toBeDefined()
        expect(addProp!.getName()).toBe("+")

        const expectedRead = new Set(
            facts
                .filter(f => f[0] === "reads" && f[1] === addId)
                .map(f => f[2] as string)
        )
        const expectedWrite = new Set(
            facts
                .filter(f => f[0] === "writes" && f[1] === addId)
                .map(f => f[2] as string)
        )
        expect(expectedRead.size).toBe(2)
        expect(expectedWrite.size).toBe(1)
        expect(expectedWrite.has(outId)).toBe(true)

        const trigger = construct_cell<number>("add-plus-trig")
        const { derived } = wire_topology_datalog_pipeline(
            trigger,
            programPlusNeighborsByName(),
            "add_plus_by_name"
        )
        const ansReads = construct_cell<FactSet>("add-plus-reads-q")
        const ansWrites = construct_cell<FactSet>("add-plus-writes-q")
        construct_grounded_query_propagator(
            derived,
            ["plus_read", V("C")],
            ansReads,
            "add_plus_qr"
        )
        construct_grounded_query_propagator(
            derived,
            ["plus_write", V("C")],
            ansWrites,
            "add_plus_qw"
        )

        update_cell(trigger, 1)
        execute_all_tasks_sequential(() => {})

        const rVal = cell_strongest_base_value(ansReads)
        const wVal = cell_strongest_base_value(ansWrites)
        expect(is_fact_set(rVal)).toBe(true)
        expect(is_fact_set(wVal)).toBe(true)
        if (!is_fact_set(rVal) || !is_fact_set(wVal)) return
        const rFs = rVal as FactSet
        const wFs = wVal as FactSet

        const gotRead = cellIdsFromUnaryQPred(rFs.facts, "plus_read")
        const gotWrite = cellIdsFromUnaryQPred(wFs.facts, "plus_write")
        expect([...gotRead].sort()).toEqual([...expectedRead].sort())
        expect([...gotWrite].sort()).toEqual([...expectedWrite].sort())

        for (const cid of expectedRead) expect(find_cell_by_id(cid)).toBeDefined()
        for (const cid of expectedWrite) expect(find_cell_by_id(cid)).toBeDefined()
        expect(find_propagator_by_id(addId)).toBe(addProp)
    })
})

describe("End-to-end: network → topology facts → reachability datalog → q_row → cells & propagators", () => {
    test("full pipeline restores queried ids via find_cell_by_id / find_propagator_by_id", () => {
        const env = primitive_env("e2e-pipe-env")
        run("(+ 1 2 e2e-pipe-out)", env)
        execute_all_tasks_sequential(() => {})

        const envMap = cell_strongest_base_value(env) as Map<string, any>
        const out = envMap.get("e2e-pipe-out")!
        const outId = cell_id(out)

        const trigger = construct_cell<number>("e2e-pipe-trig")
        const { topo, derived } = wire_topology_datalog_pipeline(
            trigger,
            topology_reachability_program("naive"),
            "e2e_pipe"
        )

        const answersReach = construct_cell<FactSet>("e2e-pipe-reach-ans")
        const answersReads = construct_cell<FactSet>("e2e-pipe-reads-ans")
        // Open query: any reachable cell pair (flows_to* over reads/writes topology).
        construct_grounded_query_propagator(
            derived,
            ["reachable", V("A"), V("B")],
            answersReach,
            "e2e_pipe_q_reach"
        )
        construct_grounded_query_propagator(
            derived,
            ["reads", V("P"), V("C")],
            answersReads,
            "e2e_pipe_q_reads"
        )

        update_cell(trigger, 1)
        execute_all_tasks_sequential(() => {})

        const reachVal = cell_strongest_base_value(answersReach)
        const readsVal = cell_strongest_base_value(answersReads)
        expect(is_fact_set(reachVal)).toBe(true)
        expect(is_fact_set(readsVal)).toBe(true)
        if (!is_fact_set(reachVal) || !is_fact_set(readsVal)) return
        const reachFs = reachVal as FactSet
        const readsFs = readsVal as FactSet

        const derivedVal = cell_strongest_base_value(derived)
        expect(is_fact_set(derivedVal)).toBe(true)
        if (!is_fact_set(derivedVal)) return
        const derivedPipe = derivedVal as FactSet
        expect(derivedPipe.facts.some(f => f[0] === "flows_to")).toBe(true)
        expect(derivedPipe.facts.some(f => f[0] === "reachable")).toBe(true)

        const reachRows = reachFs.facts.filter(f => f[0] === "q_row")
        const readsRows = readsFs.facts.filter(f => f[0] === "q_row")
        expect(reachRows.length).toBeGreaterThan(0)
        expect(readsRows.length).toBeGreaterThan(0)

        const topoVal = cell_strongest_base_value(topo)
        expect(is_fact_set(topoVal)).toBe(true)
        if (!is_fact_set(topoVal)) return
        const topoPipe = topoVal as FactSet

        const idReach = entity_ids_from_q_row_facts(reachFs.facts)
        const idReads = entity_ids_from_q_row_facts(readsFs.facts)
        const allIds = new Set([...idReach, ...idReads])
        expect(allIds.size).toBeGreaterThan(0)

        expect(find_cell_by_id(outId)).toBe(out)

        let resolvedCells = 0
        let resolvedProps = 0
        let unresolved = 0
        for (const id of allIds) {
            if (find_cell_by_id(id) !== undefined) resolvedCells++
            else if (find_propagator_by_id(id) !== undefined) resolvedProps++
            else unresolved++
        }
        expect(resolvedCells).toBeGreaterThan(0)
        expect(resolvedProps).toBeGreaterThan(0)
        expect(unresolved).toBe(0)

        const { cells, propagators, unresolved: u2 } = resolve_network_ids(allIds)
        expect(cells.length).toBe(resolvedCells)
        expect(propagators.length).toBe(resolvedProps)
        expect(u2.length).toBe(0)

        const g = graphology_from_topology_facts(topoPipe.facts, allIds)
        expect(g.order).toBe(allIds.size)
        expect(g.size).toBeGreaterThan(0)
    })
})
