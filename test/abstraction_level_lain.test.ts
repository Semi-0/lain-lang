/**
 * Abstraction level for lain-lang compiled and card networks.
 *
 * Baseline: `Propogator/test/abstraction_level.test.ts` — relation levels follow
 * `make_relation` / `parameterize_parent` rules; global root is level 0.
 * Known caveat (tested there): cells created *during* a propagator's `activate()`
 * may not get the scheduler's parent context.
 *
 * Here we only assert **invariants** on real networks: every cell and propagator in
 * the connected component has a finite relation level ≥ 1 (children of the global
 * root), and the global parent stays at level 0 after init.
 */

import { expect, test, beforeEach, describe } from "bun:test";
import {
    cell_strongest_base_value,
    type Cell,
} from "ppropogator";
import { execute_all_tasks_sequential } from "ppropogator/Shared/Scheduler/Scheduler";
import { get_global_parent } from "ppropogator/Shared/PublicState";
import type { Propagator } from "ppropogator/Propagator/Propagator";

import { primitive_env } from "../compiler/closure";
import { init_system } from "../compiler/incremental_compiler";
import { run } from "../compiler/compiler_entry";
import {
    add_card,
    build_card,
    clear_card_metadata,
    guarantee_get_card_metadata,
    internal_cell_this,
} from "../src/grpc/card";
import { update_cell } from "ppropogator/Cell/Cell";

beforeEach(() => {
    init_system();
    clear_card_metadata();
});

const propagators_touching_cell = (cell: Cell<unknown>): Propagator[] =>
    Array.from(cell.getNeighbors().values()).map((n) => n.propagator);

/** All propagators in the same connected component as `seed` (via cell↔prop edges). */
function propagators_in_component(seed: Cell<unknown>): Set<Propagator> {
    const visitedCells = new Set<Cell<unknown>>();
    const props = new Set<Propagator>();
    const queue: Cell<unknown>[] = [seed];
    while (queue.length > 0) {
        const c = queue.shift()!;
        if (visitedCells.has(c)) continue;
        visitedCells.add(c);
        for (const p of propagators_touching_cell(c)) {
            if (!props.has(p)) {
                props.add(p);
                for (const io of [...p.getInputs(), ...p.getOutputs()]) {
                    queue.push(io);
                }
            }
        }
    }
    return props;
}

/** All cells in the same connected component as `seed`. */
function cells_in_component(seed: Cell<unknown>): Set<Cell<unknown>> {
    const visitedCells = new Set<Cell<unknown>>();
    const queue: Cell<unknown>[] = [seed];
    while (queue.length > 0) {
        const c = queue.shift()!;
        if (visitedCells.has(c)) continue;
        visitedCells.add(c);
        for (const p of propagators_touching_cell(c)) {
            for (const io of [...p.getInputs(), ...p.getOutputs()]) {
                queue.push(io);
            }
        }
    }
    return visitedCells;
}

function assert_relation_levels_in_component(seed: Cell<unknown>): void {
    expect(get_global_parent().get_level()).toBe(0);

    const cells = cells_in_component(seed);
    const props = propagators_in_component(seed);

    expect(props.size).toBeGreaterThan(0);

    for (const c of cells) {
        const level = c.getRelation().get_level();
        expect(Number.isFinite(level)).toBe(true);
        expect(level).toBeGreaterThanOrEqual(1);
    }
    for (const p of props) {
        const level = p.getRelation().get_level();
        expect(Number.isFinite(level)).toBe(true);
        expect(level).toBeGreaterThanOrEqual(1);
    }
}

describe("Abstraction level on lain-lang networks", () => {
    test("compiled primitive application (+ 1 2 out): propagators and cells have valid relation levels", () => {
        const env = primitive_env("abstraction-compile");
        run("(+ 1 2 out)", env);
        execute_all_tasks_sequential(() => {});

        const envMap = cell_strongest_base_value(env) as Map<string, Cell<unknown>>;
        const out = envMap.get("out");
        expect(out).toBeDefined();

        assert_relation_levels_in_component(out!);
        expect(cell_strongest_base_value(out!)).toBe(3);
    });

    test("build_card + thisCell (+ 1 2 out): card subgraph has valid relation levels", () => {
        const env = primitive_env("abstraction-card");
        add_card("abstraction-card-id");
        build_card(env)("abstraction-card-id");
        const card = guarantee_get_card_metadata("abstraction-card-id").card;
        const thisCell = internal_cell_this(card);

        update_cell(thisCell, "(+ 1 2 out)");
        execute_all_tasks_sequential(() => {});

        const envMap = cell_strongest_base_value(env) as Map<string, Cell<unknown>>;
        const out = envMap.get("out");
        expect(out).toBeDefined();
        expect(cell_strongest_base_value(out!)).toBe(3);

        assert_relation_levels_in_component(thisCell);
    });
});
