import { expect, test, describe, beforeEach } from "bun:test";
import {
    cell_strongest_base_value,
    execute_all_tasks_sequential,
} from "ppropogator";
import { is_cell } from "ppropogator/Cell/Cell";
import { raw_compile } from "../compiler/compiler_entry";
import { init_system as init_system_compile } from "../compiler/compiler";
import {
    primitive_env,
    two_arity_prims,
    special_primitive_specs,
} from "../compiler/primitive/stdlib";
import type { Primitive } from "../compiler/primitive/base";

describe("primitive stdlib (primitive_env)", () => {
    beforeEach(() => {
        init_system_compile();
    });

    test("env keys are exactly two-arity names plus special_primitive_specs, with no duplicates", () => {
        const fromTwo = two_arity_prims.map(([name]) => name);
        const fromSpecial = special_primitive_specs.map((s) => s.key);
        const all = [...fromTwo, ...fromSpecial];
        const unique = new Set(all);
        expect(unique.size).toBe(all.length);
    });

    test("each two-arity binding resolves to a primitive with matching metadata", async () => {
        const env = primitive_env("stdlib-two-arity");
        const cells = two_arity_prims.map(([name]) => raw_compile(name, env));
        await execute_all_tasks_sequential(() => {});

        for (let i = 0; i < two_arity_prims.length; i++) {
            const [name] = two_arity_prims[i]!;
            const prim = cell_strongest_base_value(cells[i]!) as Primitive;
            expect(prim.name).toBe(name);
            expect(prim.inputs_count).toBe(2);
            expect(prim.output_count).toBe(1);
            expect(typeof prim.constructor).toBe("function");
        }
    });

    test("each special primitive binding resolves to expected metadata (including `as` aliases)", async () => {
        const env = primitive_env("stdlib-special");
        const cells = special_primitive_specs.map((s) => raw_compile(s.key, env));
        await execute_all_tasks_sequential(() => {});

        for (let i = 0; i < special_primitive_specs.length; i++) {
            const spec = special_primitive_specs[i]!;
            const prim = cell_strongest_base_value(cells[i]!) as Primitive;
            const expectedName = spec.as ?? spec.key;
            expect(prim.name).toBe(expectedName);
            expect(prim.inputs_count).toBe(spec.inputs);
            expect(prim.output_count).toBe(spec.outputs);
            expect(typeof prim.constructor).toBe("function");
        }
    });

    test("addition primitive still applies through the compiler (+ smoke)", async () => {
        const env = primitive_env("stdlib-add-smoke");
        raw_compile("(+ 1 2 out)", env);
        await execute_all_tasks_sequential(console.error);
        const outCell = raw_compile("out", env);
        await execute_all_tasks_sequential(console.error);
        expect(is_cell(outCell)).toBe(true);
        expect(cell_strongest_base_value(outCell)).toBe(3);
    });

    test("bi-directional sync operator is bound to <-> with internal name bi_sync", async () => {
        const env = primitive_env("stdlib-bi");
        const cell = raw_compile("<->", env);
        await execute_all_tasks_sequential(() => {});
        const prim = cell_strongest_base_value(cell) as Primitive;
        expect(prim.name).toBe("bi_sync");
        expect(prim.inputs_count).toBe(0);
        expect(prim.output_count).toBe(2);
    });
});
