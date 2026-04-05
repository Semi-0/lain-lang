// SPDX-License-Identifier: GPL-3.0-or-later
//
// Copyright (c) 2024–2026 semi-0
//
// NetworkDatalogPipeline — reactive propagator chain: live propagator network
// → topology facts → LogicProgram fixpoint → optional grounded query rows.
//
// Traced Graphology graphs (generalized_tracer) stay in TracedGraphDatalog.ts;
// this module uses snapshot_topology_facts() (cell / reads / writes / …).
// Rehydrate ids from q_row answers → live cells / Graphology: NetworkTopologyGraphology.ts
//
// Wiring order: create EDB cells and run_program links before firing the trigger
// that first populates the snapshot, so downstream propagators are registered.

import {
    construct_propagator,
    type Propagator,
    type Cell,
    cell_strongest_base_value,
    add_cell_content as update_cell,
    construct_cell,
} from "ppropogator"
import { ground, type Atom, type Fact } from "pmatcher/new_match/MiniDatalog"
import { snapshot_topology_facts } from "./TopologyFacts"
import {
    install_datalog_handlers,
    make_fact_set,
    run_program,
    is_fact_set,
    type FactSet,
} from "./DatalogPropagator"
import { query, type LogicProgram } from "./LogicProgram"

/** `Cell<FactSet>` refreshed from `snapshot_topology_facts()` when `trigger` updates. */
export const wire_topology_snapshot_cell = (
    trigger: Cell<any>,
    baseName = "net_topo"
): Cell<FactSet> => {
    install_datalog_handlers()
    const topo = construct_cell<FactSet>(`${baseName}_facts`)
    construct_propagator(
        [trigger],
        [topo],
        () => update_cell(topo, make_fact_set(snapshot_topology_facts())),
        `${baseName}_snapshot`
    )
    return topo
}

export type TopologyDatalogPipeline = {
    readonly topo: Cell<FactSet>
    readonly derived: Cell<FactSet>
}

/**
 * Trigger → snapshot topo facts → run `prog` into `derived`.
 * Register `run_program` before attaching the snapshot propagator (see module header).
 */
export const wire_topology_datalog_pipeline = (
    trigger: Cell<any>,
    prog: LogicProgram,
    baseName = "net_pipe"
): TopologyDatalogPipeline => {
    install_datalog_handlers()
    const topo = construct_cell<FactSet>(`${baseName}_topo`)
    const derived = run_program(prog, [topo], `${baseName}_derived`)
    construct_propagator(
        [trigger],
        [topo],
        () => update_cell(topo, make_fact_set(snapshot_topology_facts())),
        `${baseName}_snapshot`
    )
    return { topo, derived }
}

/**
 * Chain LogicPrograms: each stage’s output `FactSet` is the sole EDB for the next.
 * Returns one derived cell per program (same order as `programs`).
 */
export const wire_sequential_programs = (
    edbCell: Cell<FactSet>,
    programs: readonly LogicProgram[],
    baseName = "net_seq"
): Cell<FactSet>[] => {
    const outs: Cell<FactSet>[] = []
    let cur = edbCell
    programs.forEach((prog, i) => {
        const out = run_program(prog, [cur], `${baseName}_s${i}`)
        outs.push(out)
        cur = out
    })
    return outs
}

/**
 * When `source` updates, run `query(pattern, facts)` and write one `["q_row", ...groundTuple]`
 * fact per binding (`ground(pattern, dict)`). Merge semantics follow `FactSet` on `output`.
 */
export const construct_grounded_query_propagator = (
    source: Cell<FactSet>,
    pattern: Atom,
    output: Cell<FactSet>,
    name = "grounded_query"
): Propagator =>
    construct_propagator(
        [source],
        [output],
        () => {
            const val = cell_strongest_base_value(source)
            if (!is_fact_set(val)) return
            const rows: Fact[] = []
            for (const dict of query(pattern, val.facts)) {
                const g = ground(pattern, dict)
                if (g) rows.push(["q_row", ...g])
            }
            update_cell(output, make_fact_set(rows))
        },
        name
    )
