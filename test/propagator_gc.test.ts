/**
 * Unit tests for Propogator scheduler cell GC.
 * Verifies that when propagators are disposed, unreachable cells (those with no
 * remaining propagator references) are garbage-collected and removed from global state.
 */
import { expect, test, beforeEach, describe } from "bun:test";
import { construct_cell, cell_id } from "ppropogator";
import { cell_snapshot } from "ppropogator/Shared/PublicState";
import { execute_all_tasks_sequential } from "ppropogator/Shared/Scheduler/Scheduler";
import { dispose_propagator } from "ppropogator/Propagator/Propagator";
import { p_sync } from "ppropogator/Propagator/BuiltInProps";
import { init_system } from "../compiler/incremental_compiler";

beforeEach(() => {
    init_system();
});

describe("Propagator cell GC", () => {
    test("unreachable cells are garbage-collected after propagator disposal", () => {
        const inCell = construct_cell("gc_test_in");
        const outCell = construct_cell("gc_test_out");
        const prop = p_sync(inCell, outCell);

        execute_all_tasks_sequential(() => {});

        const inId = cell_id(inCell);
        const outId = cell_id(outCell);
        expect(cell_snapshot().some((c) => cell_id(c) === inId)).toBe(true);
        expect(cell_snapshot().some((c) => cell_id(c) === outId)).toBe(true);

        dispose_propagator(prop);
        execute_all_tasks_sequential(() => {});

        expect(cell_snapshot().some((c) => cell_id(c) === inId)).toBe(false);
        expect(cell_snapshot().some((c) => cell_id(c) === outId)).toBe(false);
    });

    test("cells with remaining propagator references are not collected", () => {
        const shared = construct_cell("gc_shared");
        const out1 = construct_cell("gc_out1");
        const out2 = construct_cell("gc_out2");
        const prop1 = p_sync(shared, out1);
        const prop2 = p_sync(shared, out2);

        execute_all_tasks_sequential(() => {});

        const sharedId = cell_id(shared);
        const out1Id = cell_id(out1);
        const out2Id = cell_id(out2);

        dispose_propagator(prop1);
        execute_all_tasks_sequential(() => {});

        expect(cell_snapshot().some((c) => cell_id(c) === sharedId)).toBe(true);
        expect(cell_snapshot().some((c) => cell_id(c) === out1Id)).toBe(false);
        expect(cell_snapshot().some((c) => cell_id(c) === out2Id)).toBe(true);
    });
});
