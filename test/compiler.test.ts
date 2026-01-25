import { expect, test, beforeEach, describe } from "bun:test";
import { 
    type Cell,
    cell_strongest,
    execute_all_tasks_sequential,
    reactive_mode,
    run_immediate,
    update as update_cell,
    cell_strongest_base_value,
    ce_constant,
    p_add,
    cell_content,
} from "ppropogator";
import { 
    construct_cell,
    is_cell,
    set_handle_contradiction,
    cell_id
} from "ppropogator/Cell/Cell";
import { 
    set_global_state, 
    PublicStateCommand 
} from "ppropogator/Shared/PublicState";
import { 
    set_merge,
    generic_merge, 
    merge_layered
} from "ppropogator/Cell/Merge";
import { 
    replay_propagators,
    run_scheduler_and_replay,
    set_immediate_execute,
    set_record_alerted_propagator,
    set_scheduler
} from "ppropogator/Shared/Scheduler/Scheduler";
import { simple_scheduler } from "ppropogator/Shared/Scheduler/SimpleScheduler";
import { 
    reactive_fresh_merge,
    trace_earliest_emerged_value 
} from "ppropogator/AdvanceReactivity/traced_timestamp/genericPatch";
import { get_base_value } from "sando-layer/Basic/Layer";
import { the_nothing, is_nothing } from "ppropogator/Cell/CellValue";

// Import compiler entry point
import { run } from "../compiler/compiler_entry";
import { 
    construct_env_with_inital_value,
    empty_lexical_environment,
    type LexicalEnvironment,

    summarize_env,
} from "../compiler/env";

import { calculate_closure_hash, Closure, construct_closure_raw, incremental_apply_closure, primitive_env } from "../compiler/closure";


import { LainType, make_element } from "../compiler/lain_element";
import { merge_patched_set } from "ppropogator/DataTypes/PatchedValueSet";
import { cell_name } from "ppropogator/Cell/Cell";
import { ce_is_primitive } from "../compiler/closure";
import { describe_propagator_frame } from "ppropogator/Shared/Scheduler/RuntimeFrame";
import { trace_cell } from "ppropogator/Shared/GraphTraversal";
import { propagator_id } from "ppropogator/Propagator/Propagator";
import { merge_temporary_value_set } from "ppropogator/DataTypes/TemporaryValueSet";
import { p_reactive_dispatch, source_cell, update_source_cell } from "ppropogator/DataTypes/PremisesSource";
import { parse, State } from "parse-combinator";
import { parseExpr } from "../compiler/parser";
import { define } from "../compiler/env";
import { init_system } from "../compiler/incremental_compiler";

beforeEach(() => {
    init_system()
});

describe("Compiler Entry Point Tests (run function)", () => {
    
    describe("1. Constants (Self-Evaluating)", () => {
        test("should compile string constant", async () => {
            const env = empty_lexical_environment("test");
            const code = '"hello"';
            
            const result = run(code, env);
            
            await execute_all_tasks_sequential(() => {});
            
            expect(is_cell(result)).toBe(true);
            expect(cell_strongest_base_value(result)).toBe("hello"); 
        });

        test("should compile number constant", async () => {
            const env = empty_lexical_environment("test");
            const code = "42";
            
            const result = run(code, env);
            
            await execute_all_tasks_sequential(() => {});
            
            expect(is_cell(result)).toBe(true);
            expect(cell_strongest_base_value(result)).toBe(42);
        });

        test("should compile boolean constant true", async () => {
            const env = empty_lexical_environment("test");
            const code = "#t";
            
            const result = run(code, env);
            
            await execute_all_tasks_sequential(() => {});
            
            expect(is_cell(result)).toBe(true);
            expect(cell_strongest_base_value(result)).toBe(true);
        });

        test("should compile boolean constant false", async () => {
            const env = empty_lexical_environment("test");
            const code = "#f";
            
            const result = run(code, env);
            
            await execute_all_tasks_sequential(() => {});
            
            expect(is_cell(result)).toBe(true);
            expect(cell_strongest_base_value(result)).toBe(false);
        });
    });

    describe("2. Symbol Lookup", () => {
        test("should lookup symbol from environment", async () => {
            const env = empty_lexical_environment("test");
            const code = "x";
            
            const result = run(code, env);
            
            await execute_all_tasks_sequential(() => {});
            
            expect(is_cell(result)).toBe(true);
        });

        test("should lookup symbol from environment with quoted expression", async () => {
            const env = construct_env_with_inital_value(
                [
                    ["x", ce_constant(1)],
                ],
                "test"
            );

         
            const code = "x";
            
            const result = run(code, env);
            
            await execute_all_tasks_sequential(() => {});


            expect(is_cell(result)).toBe(true);
            expect(cell_strongest_base_value(result)).toBe(1);
        });

    });

    describe("3. Primitive Propagator Application", () => {
        test("should apply addition primitive propagator", async () => {

            const primEnvCell = primitive_env();
            
            const code = "(+ 1 2 out)";
            const result = run(code, primEnvCell);

            await execute_all_tasks_sequential(console.error)
            const e = run("out", primEnvCell)
    
            await execute_all_tasks_sequential(console.error)
 

            console.log(summarize_env(primEnvCell))

            expect(cell_strongest_base_value(e)).toBe(3);

            run("(? out)", primEnvCell);
        });


    });

    describe("4. Closure Application", () => {
        test("should define and apply a closure", async () => {
            const primEnvCell = primitive_env()
            const env = primEnvCell
            
            // First define a network (closure)
            const defineCode = `(network add1 (>:: x) (::> y) (+ x 1 y))`;
            const defineEnv = run(defineCode, env);

        
            
            await execute_all_tasks_sequential(console.error);
            const env1 = cell_strongest_base_value(env) as Map<string, Cell<any>>
            
            const applyCode = "(add1 5 out)";
            const resultEnv = run(applyCode, env);
            
            await execute_all_tasks_sequential(console.error);
    
           
            const e = cell_strongest_base_value(env)
            const out = e.get("out")
            if (out) {
                expect(cell_strongest_base_value(out)).toBe(6);
            }
           else {
            console.log(summarize_env(env))
            throw new Error("out cell not found")
           }

   
        });

        test("should closure with multiple body", async () => {
            const primEnvCell = primitive_env()
            const env = primEnvCell
            
            // First define a network (closure)
            const defineCode = `(network add3 (>:: x) (::> y) (+ x 1 x1) (+ x1 1 x2) (+ x2 1 y))`;
            const defineEnv = run(defineCode, env);
            
            await execute_all_tasks_sequential(console.error);
        
            const applyCode = "(add3 5 out)";
            const resultEnv = run(applyCode, env);
            
            await execute_all_tasks_sequential(console.error);
    
           
            const e = cell_strongest_base_value(env)
            expect(cell_strongest_base_value(e.get("out"))).toBe(8);

   
        });


        test("okay with nested calling", async () => {

            const primEnvCell = primitive_env()
            const env = primEnvCell
            
            // First define a network (closure)
            const defineCode = `(network add1 (>:: x) (::> y) (+ x 1 y))`;
            const defineEnv = run(defineCode, env);

        
            execute_all_tasks_sequential(console.error)

            const env1 = cell_strongest_base_value(env) as Map<string, Cell<any>>
            
            run("(add1_again 8 out2)", env)

            execute_all_tasks_sequential(console.error);

            const add1_again = '(network add1_again (>:: x) (::> y) (add1 x y))'
            run(add1_again, env) 

            await execute_all_tasks_sequential(console.error)
            const e2 = cell_strongest_base_value(env) 
            expect(cell_strongest_base_value(e2.get("out2"))).toBe(9);
        });

        test("incremental changing behavior of closure", async () => {
            
            const primEnvCell = primitive_env()
            const env = primEnvCell
            const source = source_cell("source")
            
            //
            // First define a network (closure)
            const defineCode = `(network magic (>:: x y) (::> z) (+ x y z))`;
            run(defineCode, env, source, 0);
        
            await execute_all_tasks_sequential(console.error)

            cell_strongest_base_value(env) as Map<string, Cell<any>>
            
            run("(magic 1 8 out2)", env, source, 0)

            execute_all_tasks_sequential(console.error);

            const e2 = cell_strongest_base_value(env) 
            expect(cell_strongest_base_value(e2.get("out2"))).toBe(9);

            console.log("changing behavior of closure")
            run("(network magic (>:: x y) (::> z) (- x y z))", env, source, 1);
            await execute_all_tasks_sequential(console.error)
            const e3 = cell_strongest_base_value(env) 
            const out2 = e3.get("out2")
            console.log(out2.summarize())
            expect(cell_strongest_base_value(out2)).toBe(-7);
        }); 

        test("incremental changing behavior of closure 2", async () => {
            
            const primEnvCell = primitive_env()
            const env = primEnvCell
            const source = source_cell("source")
            
            //
            // First define a network (closure)
            const defineCode = `(network magic2 (>:: x) (::> z) (+ x 1 z))`;
            run(defineCode, env, source, 0);
        
            await execute_all_tasks_sequential(console.error)

            cell_strongest_base_value(env) as Map<string, Cell<any>>
            
            run("(magic2 1 out3)", env, source, 0)

            execute_all_tasks_sequential(console.error);

            const e2 = cell_strongest_base_value(env) 
            expect(cell_strongest_base_value(e2.get("out3"))).toBe(2);

            console.log("changing behavior of closure")
            run("(network magic2 (>:: x) (::> z) (- x 1 z))", env, source, 1);
            await execute_all_tasks_sequential(console.error)
            const e3 = cell_strongest_base_value(env) 
            const out2 = e3.get("out3")
            console.log(out2.summarize())
            expect(cell_strongest_base_value(out2)).toBe(0);
        }); 

    });
    

});
