import { expect, test, beforeEach, describe } from "bun:test";
import { ce_constant, generic_merge, inspect_content, inspect_strongest, set_merge, is_nothing, the_nothing } from "ppropogator";
import { Cell, cell_strongest, cell_strongest_base_value, construct_cell, update_cell } from "ppropogator/Cell/Cell";
import { ce_struct } from "ppropogator/DataTypes/CarriedCell";
import { PublicStateCommand, set_global_state } from "ppropogator/Shared/PublicState";
import { execute_all_tasks_sequential, run_scheduler_and_replay, set_scheduler } from "ppropogator/Shared/Scheduler/Scheduler";
import { simple_scheduler } from "ppropogator/Shared/Scheduler/SimpleScheduler";
import { ce_lexical_lookup, p_lexical_lookup } from "../compiler/env";
import { set } from "effect/HashMap";
import { trace_generic_procedure } from "generic-handler/GenericProcedure";
import { get_error_layer_value } from "sando-layer/Specified/ErrorLayer";
import { merge_temporary_value_set } from "ppropogator/DataTypes/TemporaryValueSet";
import { merge_layered } from "ppropogator/Cell/Merge";
import { merge_patched_set } from "ppropogator/DataTypes/PatchedValueSet";
import { source_constant } from "../compiler/lain_element";
import { p_reactive_dispatch, source_cell, update_source_cell } from "ppropogator/DataTypes/PremisesSource";
import { LayeredObject } from "sando-layer/Basic/LayeredObject";




beforeEach(() => {
    set_global_state(PublicStateCommand.CLEAN_UP);
    set_scheduler(simple_scheduler());
    set_merge(merge_temporary_value_set)
});


describe("lexical_scope_environment_test", () => {

    test("should find closest value in lexical scope", () => {

        const a_inside = source_constant(1)
        const outer = construct_cell("outer")
        const env = ce_struct({
            parent: ce_struct({
                parent: construct_cell("root"),
                a: a_inside
            }),
            a: construct_cell("a")
        })

        const accessor = construct_cell("accessor")
        p_lexical_lookup("a", env, accessor)
        
        run_scheduler_and_replay(console.error)


        expect(cell_strongest_base_value(accessor)).toBe(1);
        expect(cell_strongest_base_value(outer)).toBe(the_nothing);
    })

    test("should shadow outer scope with inner scope value", () => {
        const outer_value = source_constant(10)
        const inner_value = source_constant(20)
        
        const env = ce_struct({
            parent: ce_struct({
                parent: construct_cell("root"),
                x: outer_value
            }),
            x: inner_value
        })

        const accessor = construct_cell("accessor")
        p_lexical_lookup("x", env, accessor)
        
        execute_all_tasks_sequential(() => {});

        // Should prefer inner scope (distance 0) over outer scope (distance 1)
        expect(cell_strongest_base_value(accessor)).toBe(20);
    })

    test("should find value in grandparent when not in parent", () => {
        const grandparent_value = source_constant(100)
        
        const env = ce_struct({
            parent: ce_struct({
                parent: ce_struct({
                    parent: construct_cell("root"),
                    y: grandparent_value
                })
            })
        })

        const accessor = construct_cell("accessor")
        p_lexical_lookup("y", env, accessor)
        
        execute_all_tasks_sequential(() => {});

        expect(cell_strongest_base_value(accessor)).toBe(100);
    })

    test("should skip nothing values and find next available", () => {
        const outer_value = source_constant(42)
        
        const inner_cell = construct_cell("inner_cell")
        // inner_cell has nothing, so should skip to outer
        
        const env = ce_struct({
            parent: ce_struct({
                parent: construct_cell("root"),
                z: outer_value
            }),
            z: inner_cell
        })

        const accessor = construct_cell("accessor")
        p_lexical_lookup("z", env, accessor)
        
        execute_all_tasks_sequential(() => {});

        // Should skip inner (nothing) and find outer
        expect(cell_strongest_base_value(accessor)).toBe(42);
    })

    test("should update when outer value changes", () => {

        const source = source_cell("source") as Cell<LayeredObject<Map<Cell<any>, any>>>
        const outer_cell = construct_cell("outer_cell") 
        const inner_cell = construct_cell("inner_cell")

        p_reactive_dispatch(source, outer_cell)
        p_reactive_dispatch(source, inner_cell)
        
        const env = ce_struct({
            parent: ce_struct({
                parent: construct_cell("root"),
                w: outer_cell
            }),
            w: inner_cell
        })

        const accessor = construct_cell("accessor")
        p_lexical_lookup("w", env, accessor)
        
        execute_all_tasks_sequential(() => {});

        // Initially inner is nothing, so should get outer (which is also nothing)
        expect(is_nothing(cell_strongest(accessor))).toBe(true);

        // Update inner - should now prefer inner
        update_source_cell(source, new Map([[inner_cell, 5]]))
        execute_all_tasks_sequential(() => {});
        expect(cell_strongest_base_value(accessor)).toBe(5);

        // Update outer - should still prefer inner
        update_source_cell(source, new Map([[outer_cell, 15]]))
        execute_all_tasks_sequential(() => {});
        expect(cell_strongest_base_value(accessor)).toBe(5);
    })

    test("should handle multiple variables independently", () => {
        const a_value = source_constant(1)
        const b_value = source_constant(2)
        
        const env = ce_struct({
            parent: ce_struct({
                parent: construct_cell("root"),
                a: a_value,
                b: b_value
            })
        })

        const accessor_a = construct_cell("accessor_a")
        const accessor_b = construct_cell("accessor_b")
        
        p_lexical_lookup("a", env, accessor_a)
        p_lexical_lookup("b", env, accessor_b)
        
        execute_all_tasks_sequential(() => {});

        expect(cell_strongest_base_value(accessor_a)).toBe(1);
        expect(cell_strongest_base_value(accessor_b)).toBe(2);
    })

    test("should prefer local scope value when both local and outer exist", () => {
        const source = source_cell("source") as Cell<LayeredObject<Map<Cell<any>, any>>>
        const local_cell = construct_cell("local_cell")
        p_reactive_dispatch(source, local_cell)
        
        const env = ce_struct({
            parent: ce_struct({
                parent: construct_cell("root"),
                v: ce_constant(99, "outer_v")
            }),
            v: local_cell
        })

        const accessor = construct_cell("accessor")
        p_lexical_lookup("v", env, accessor)
        
        // Set local first (before accessor gets outer value)
        update_source_cell(source, new Map([[local_cell, 200]]))
        execute_all_tasks_sequential(() => {});

        // Accessor should get local value (distance 0, closer than outer at distance 1)
        expect(cell_strongest_base_value(accessor)).toBe(200);
        expect(cell_strongest_base_value(local_cell)).toBe(200);
    })

    test("should handle nested scopes with same variable name", () => {
        const level1 = source_constant(1)
        const level2 = source_constant(2)
        const level3 = source_constant(3)
        
        const env = ce_struct({
            parent: ce_struct({
                parent: ce_struct({
                    parent: ce_struct({
                        parent: construct_cell("root"),
                        x: level1
                    }),
                    x: level2
                }),
                x: level3
            })
        })

        const accessor = construct_cell("accessor")
        p_lexical_lookup("x", env, accessor)
        
        execute_all_tasks_sequential(() => {});

        // Should find level3 (closest, distance 1)
        expect(cell_strongest_base_value(accessor)).toBe(3);
    })

    test("should handle empty environment chain", () => {
        const env = ce_struct({
            parent: ce_struct({
                parent: construct_cell("root")
            })
        })

        const accessor = construct_cell("accessor")
        p_lexical_lookup("nonexistent", env, accessor)
        
        execute_all_tasks_sequential(() => {});

        // Should be nothing since variable doesn't exist
        expect(is_nothing(cell_strongest(accessor))).toBe(true);
    })

    test("should handle updates to inner scope after outer has value", () => {
        const source = source_cell("source") as Cell<LayeredObject<Map<Cell<any>, any>>>
       
        const outer_cell = construct_cell("outer_cell")
        const inner_cell = construct_cell("inner_cell")
        p_reactive_dispatch(source, outer_cell)
        p_reactive_dispatch(source, inner_cell)

        const env = ce_struct({
            parent: ce_struct({
                parent: construct_cell("root"),
                u: outer_cell
            }),
            u: inner_cell
        })

        const accessor = construct_cell("accessor")
        p_lexical_lookup("u", env, accessor)
        
        // Set inner first (before outer), so inner is distance 0
        update_source_cell(source, new Map([[inner_cell, 75]]))
        execute_all_tasks_sequential(() => {});
        
        // Accessor should get inner value
        expect(cell_strongest_base_value(accessor)).toBe(75);
        expect(cell_strongest_base_value(inner_cell)).toBe(75);

        // Now update outer - should still prefer inner (closer)
        update_source_cell(source, new Map([[outer_cell, 50]]))
        execute_all_tasks_sequential(() => {});
        
        // Should still prefer inner (distance 0) over outer (distance 1)
        expect(cell_strongest_base_value(accessor)).toBe(75);
        expect(cell_strongest_base_value(outer_cell)).toBe(50);
    })

    test("should work with ce_lexical_lookup convenience function", () => {
        const value = source_constant(123)
        
        const env = ce_struct({
            parent: ce_struct({
                parent: construct_cell("root"),
                test: value
            })
        })

        const accessor = ce_lexical_lookup("test", env)
        
        execute_all_tasks_sequential(() => {});
        expect(cell_strongest_base_value(accessor)).toBe(123);
    })
})
