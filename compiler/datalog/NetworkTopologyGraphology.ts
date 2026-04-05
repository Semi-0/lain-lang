// SPDX-License-Identifier: GPL-3.0-or-later
//
// Copyright (c) 2024–2026 semi-0
//
// NetworkTopologyGraphology — bridge topology / datalog query results back to
// live cells & propagators and to Graphology graphs usable with graph_combinators.
//
// Companion to NetworkDatalogPipeline.ts:
//   • Topology EDB from snapshot_topology_facts() already stores **cellId** and
//     **propagatorId** in facts (see TopologyFacts header): cell, propagator,
//     kind, namespace, reads, writes, …
//   • construct_grounded_query_propagator emits ["q_row", pred, ...groundArgs];
//     each ground string arg that is a network node id can be recovered here.
//
// Traced Graphology-only workflows stay in TracedGraphDatalog.ts
// (traced_graph_to_facts / induced_subgraph_from_ids).

import { DirectedGraph } from "graphology"
import {
    construct_propagator,
    type Propagator,
    type Cell,
    cell_strongest_base_value,
    add_cell_content as update_cell,
} from "ppropogator"
import { find_cell_by_id, find_propagator_by_id } from "ppropogator/Shared/GraphTraversal"
import type { Fact } from "pmatcher/new_match/MiniDatalog"
import { is_fact_set, type FactSet } from "./DatalogPropagator"

/** Parsed `["q_row", predicate, ...groundArgs]` from grounded query output. */
export type QRowDecoded = { readonly pred: string; readonly args: readonly string[] }

export const decode_q_row = (f: Fact): QRowDecoded | null => {
    if (f.length < 2 || f[0] !== "q_row" || typeof f[1] !== "string") return null
    const args = f.slice(2).filter((x): x is string => typeof x === "string")
    return { pred: f[1], args }
}

/**
 * All string arguments carried on `q_row` facts (positions after the predicate).
 * Use as `keep` when building a subgraph: those ids are cells/propagators in the snapshot.
 */
export const entity_ids_from_q_row_facts = (facts: Fact[]): Set<string> => {
    const out = new Set<string>()
    for (const f of facts) {
        const d = decode_q_row(f)
        if (d) for (const a of d.args) out.add(a)
    }
    return out
}

/** Restrict to `q_row` rows whose predicate equals `pred` (e.g. "ns_match"). */
export const entity_ids_from_q_rows_matching = (facts: Fact[], pred: string): Set<string> => {
    const out = new Set<string>()
    for (const f of facts) {
        const d = decode_q_row(f)
        if (d && d.pred === pred) for (const a of d.args) out.add(a)
    }
    return out
}

export type ResolvedNetworkEntities = {
    readonly cells: Cell<any>[]
    readonly propagators: Propagator[]
    /** Ids still present in the snapshot registry but not found (GC / race). */
    readonly unresolved: string[]
}

/** Map topology ids to live `Cell` / `Propagator` handles (current snapshot). */
export const resolve_network_ids = (ids: Iterable<string>): ResolvedNetworkEntities => {
    const cells: Cell<any>[] = []
    const propagators: PropagatorT[] = []
    const unresolved: string[] = []
    for (const id of ids) {
        const c = find_cell_by_id(id)
        if (c !== undefined) {
            cells.push(c)
            continue
        }
        const p = find_propagator_by_id(id)
        if (p !== undefined) {
            propagators.push(p)
            continue
        }
        unresolved.push(id)
    }
    return { cells, propagators, unresolved }
}

type NodeAttrAcc = {
    label: string
    kind: "cell" | "propagator"
    namespace: string
    relationLevel: number
    value?: string
}

const parse_level = (s: string): number => {
    const n = Number(s)
    return Number.isFinite(n) ? n : 0
}

/**
 * Build a DirectedGraph over `keepIds` using topology facts only.
 * Edges follow the same dependency direction as generalized_tracer graph_step:
 *   reads(P,C)  → edge C → P (cell feeds propagator)
 *   writes(P,C) → edge P → C (propagator feeds cell)
 *
 * Node attrs match graph_combinators / node_attrs shape: kind uses "propagator"
 * (not topology's "prop").
 */
export const graphology_from_topology_facts = (
    facts: Fact[],
    keepIds: Set<string>
): DirectedGraph => {
    const graph = new DirectedGraph()
    const byId = new Map<string, NodeAttrAcc>()

    const ensure = (id: string): NodeAttrAcc => {
        let a = byId.get(id)
        if (!a) {
            a = {
                label: id,
                kind: "cell",
                namespace: "unknown",
                relationLevel: 0,
            }
            byId.set(id, a)
        }
        return a
    }

    for (const f of facts) {
        if (f.length < 2 || typeof f[1] !== "string") continue
        const id = f[1]
        if (!keepIds.has(id)) continue

        const acc = ensure(id)
        const tag = f[0]

        if (tag === "cell" && typeof f[2] === "string") acc.label = f[2]
        else if (tag === "propagator" && typeof f[2] === "string") acc.label = f[2]
        else if (tag === "label" && typeof f[2] === "string") acc.label = f[2]
        else if (tag === "namespace" && typeof f[2] === "string") acc.namespace = f[2]
        else if (tag === "level" && typeof f[2] === "string")
            acc.relationLevel = parse_level(f[2])
        else if (tag === "kind" && f[2] === "cell") acc.kind = "cell"
        else if (tag === "kind" && f[2] === "prop") acc.kind = "propagator"
        else if (tag === "value" && typeof f[2] === "string") acc.value = f[2]
    }

    for (const id of keepIds) {
        const a = ensure(id)
        graph.mergeNode(id, {
            label: a.label,
            kind: a.kind,
            namespace: a.namespace,
            relationLevel: a.relationLevel,
            ...(a.value !== undefined ? { value: a.value } : {}),
        })
    }

    for (const f of facts) {
        if (f[0] === "reads" && f.length >= 3 && typeof f[1] === "string" && typeof f[2] === "string") {
            const propId = f[1]
            const cellId = f[2]
            if (keepIds.has(propId) && keepIds.has(cellId) && graph.hasNode(cellId) && graph.hasNode(propId)) {
                if (!graph.hasEdge(cellId, propId)) graph.addEdge(cellId, propId)
            }
        }
        if (f[0] === "writes" && f.length >= 3 && typeof f[1] === "string" && typeof f[2] === "string") {
            const propId = f[1]
            const cellId = f[2]
            if (keepIds.has(propId) && keepIds.has(cellId) && graph.hasNode(cellId) && graph.hasNode(propId)) {
                if (!graph.hasEdge(propId, cellId)) graph.addEdge(propId, cellId)
            }
        }
    }

    return graph
}

/**
 * Propagator: when `topo` or `answers` updates, intersect entity ids from `q_row`
 * facts in `answers` with the latest topology snapshot, build a Graphology graph,
 * and write it to `output` (full replace).
 *
 * Pass the same `topo` cell that feeds your datalog program, and the `answers`
 * cell fed by construct_grounded_query_propagator.
 */
export const construct_topology_filtered_graph_propagator = (
    topo: Cell<FactSet>,
    answers: Cell<FactSet>,
    output: Cell<DirectedGraph>,
    name = "topo_filtered_graph"
): Propagator =>
    construct_propagator(
        [topo, answers],
        [output],
        () => {
            const t = cell_strongest_base_value(topo)
            const a = cell_strongest_base_value(answers)
            if (!is_fact_set(t) || !is_fact_set(a)) return
            const keep = entity_ids_from_q_row_facts(a.facts)
            const g =
                keep.size === 0
                    ? new DirectedGraph()
                    : graphology_from_topology_facts(t.facts, keep)
            update_cell(output, g)
        },
        name
    )
