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
import { is_layered_object, type LayeredObject } from "sando-layer/Basic/LayeredObject";
import { the_nothing, is_nothing } from "ppropogator/Cell/CellValue";

// Import compiler entry point
import { run, raw_compile } from "../compiler/compiler_entry";
import { 
    construct_env_with_inital_value,
    empty_lexical_environment,
    extend_env,
    type LexicalEnvironment,

    summarize_env,
} from "../compiler/env";

import { calculate_closure_hash, construct_closure_raw, incremental_apply_closure, primitive_env } from "../compiler/closure";


import { LainType, make_element } from "../compiler/lain_element";
import { merge_patched_set } from "ppropogator/DataTypes/PatchedValueSet";
import { cell_name } from "ppropogator/Cell/Cell";
import { ce_is_primitive } from "../compiler/closure";
import { describe_propagator_frame } from "ppropogator/Shared/Scheduler/RuntimeFrame";
import { trace_cell } from "ppropogator/Shared/GraphTraversal";
import { propagator_id } from "ppropogator/Propagator/Propagator";
import { merge_temporary_value_set } from "ppropogator/DataTypes/TemporaryValueSet";
import { source_constant_cell } from "ppropogator/DataTypes/PremisesSource";
import { parse, State } from "parse-combinator";
import { parseExpr } from "../compiler/parser";
import { define } from "../compiler/env";
import { init_system } from "../compiler/incremental_compiler";
import { init_system as init_system_compile } from "../compiler/compiler";
import { is_graphology_graph } from "../src/grpc/codec/session_encode";

beforeEach(() => {
    
    init_system()
});

// describe("Compiler Entry Point Tests (run function)", () => {
    
//     describe("1. Constants (Self-Evaluating)", () => {
//         test("should compile string constant", async () => {
//             const env = empty_lexical_environment("test");
//             const code = '"hello"';
            
//             const result = run(code, env);
            
//             await execute_all_tasks_sequential(() => {});
            
//             expect(is_cell(result)).toBe(true);
//             expect(cell_strongest_base_value(result)).toBe("hello"); 
//         });

//         test("should compile number constant", async () => {
//             const env = empty_lexical_environment("test");
//             const code = "42";
            
//             const result = run(code, env);
            
//             await execute_all_tasks_sequential(() => {});
            
//             expect(is_cell(result)).toBe(true);
//             expect(cell_strongest_base_value(result)).toBe(42);
//         });

//         test("should compile boolean constant true", async () => {
//             const env = empty_lexical_environment("test");
//             const code = "#t";
            
//             const result = run(code, env);
            
//             await execute_all_tasks_sequential(() => {});
            
//             expect(is_cell(result)).toBe(true);
//             expect(cell_strongest_base_value(result)).toBe(true);
//         });

//         test("should compile boolean constant false", async () => {
//             const env = empty_lexical_environment("test");
//             const code = "#f";
            
//             const result = run(code, env);
            
//             await execute_all_tasks_sequential(() => {});
            
//             expect(is_cell(result)).toBe(true);
//             expect(cell_strongest_base_value(result)).toBe(false);
//         });
//     });

//     describe("2. Symbol Lookup", () => {
//         test("should lookup symbol from environment", async () => {
//             const env = empty_lexical_environment("test");
//             const code = "x";
            
//             const result = run(code, env);
            
//             await execute_all_tasks_sequential(() => {});
            
//             expect(is_cell(result)).toBe(true);
//         });

//         test("should lookup symbol from environment with quoted expression", async () => {
//             const env = construct_env_with_inital_value(
//                 [
//                     ["x", ce_constant(1)],
//                 ],
//                 "test"
//             );

         
//             const code = "x";
            
//             const result = run(code, env);
            
//             await execute_all_tasks_sequential(() => {});


//             expect(is_cell(result)).toBe(true);
//             expect(cell_strongest_base_value(result)).toBe(1);
//         });

//     });

//     describe("3. Primitive Propagator Application", () => {
//         test("should apply addition primitive propagator", async () => {

//             const primEnvCell = primitive_env();
            
//             const code = "(+ 1 2 out)";
//             const result = run(code, primEnvCell);

//             await execute_all_tasks_sequential(console.error)
//             const e = run("out", primEnvCell)
    
//             await execute_all_tasks_sequential(console.error)
 

//             console.log(summarize_env(primEnvCell))

//             expect(cell_strongest_base_value(e)).toBe(3);

//             run("(? out)", primEnvCell);
//         });


//     });

//     describe("4. Closure Application", () => {
//         test("should define and apply a closure", async () => {
//             const primEnvCell = primitive_env()
//             const env = primEnvCell
            
//             // First define a network (closure)
//             const defineCode = `(network add1 (>:: x) (::> y) (+ x 1 y))`;
//             const defineEnv = run(defineCode, env);

        
            
//             await execute_all_tasks_sequential(console.error);
//             const env1 = cell_strongest_base_value(env) as Map<string, Cell<any>>
            
//             const applyCode = "(add1 5 out)";
//             const resultEnv = run(applyCode, env);
            
//             await execute_all_tasks_sequential(console.error);
    
           
//             const e = cell_strongest_base_value(env)
//             const out = e.get("out")
//             if (out) {
//                 expect(cell_strongest_base_value(out)).toBe(6);
//             }
//            else {
//             console.log(summarize_env(env))
//             throw new Error("out cell not found")
//            }

   
//         });

//         test("should closure with multiple body", async () => {
//             const primEnvCell = primitive_env()
//             const env = primEnvCell
            
//             // First define a network (closure)
//             const defineCode = `(network add3 (>:: x) (::> y) (+ x 1 x1) (+ x1 1 x2) (+ x2 1 y))`;
//             const defineEnv = run(defineCode, env);
            
//             await execute_all_tasks_sequential(console.error);
        
//             const applyCode = "(add3 5 out)";
//             const resultEnv = run(applyCode, env);
            
//             await execute_all_tasks_sequential(console.error);
    
           
//             const e = cell_strongest_base_value(env)
//             expect(cell_strongest_base_value(e.get("out"))).toBe(8);

   
//         });


//         test("okay with nested calling", async () => {

//             const primEnvCell = primitive_env()
//             const env = primEnvCell
            
//             // First define a network (closure)
//             const defineCode = `(network add1 (>:: x) (::> y) (+ x 1 y))`;
//             const defineEnv = run(defineCode, env);

        
//             execute_all_tasks_sequential(console.error)

//             const env1 = cell_strongest_base_value(env) as Map<string, Cell<any>>
            
//             run("(add1_again 8 out2)", env)

//             execute_all_tasks_sequential(console.error);

//             const add1_again = '(network add1_again (>:: x) (::> y) (add1 x y))'
//             run(add1_again, env) 

//             await execute_all_tasks_sequential(console.error)
//             const e2 = cell_strongest_base_value(env) 
//             expect(cell_strongest_base_value(e2.get("out2"))).toBe(9);
//         });

//         test("incremental changing behavior of closure", async () => {
            
//             const primEnvCell = primitive_env()
//             const env = primEnvCell
            
//             //
//             // First define a network (closure)
//             const defineCode = `(network magic (>:: x y) (::> z) (+ x y z))`;
//             run(defineCode, env, undefined, 0);
        
//             await execute_all_tasks_sequential(console.error)

//             cell_strongest_base_value(env) as Map<string, Cell<any>>
            
//             run("(magic 1 8 out2)", env, undefined, 0)

//             execute_all_tasks_sequential(console.error);

//             const e2 = cell_strongest_base_value(env) 
//             expect(cell_strongest_base_value(e2.get("out2"))).toBe(9);

//             console.log("changing behavior of closure")
//             run("(network magic (>:: x y) (::> z) (- x y z))", env, undefined, 1);
//             await execute_all_tasks_sequential(console.error)
//             const e3 = cell_strongest_base_value(env) 
//             const out2 = e3.get("out2")
//             console.log(out2.summarize())
//             expect(cell_strongest_base_value(out2)).toBe(-7);
//         }); 

//         test("incremental changing behavior of closure 2", async () => {
            
//             const primEnvCell = primitive_env()
//             const env = primEnvCell
            
//             //
//             // First define a network (closure)
//             const defineCode = `(network magic2 (>:: x) (::> z) (+ x 1 z))`;
//             run(defineCode, env, undefined, 0);
        
//             await execute_all_tasks_sequential(console.error)

//             cell_strongest_base_value(env) as Map<string, Cell<any>>
            
//             run("(magic2 1 out3)", env, undefined, 0)

//             execute_all_tasks_sequential(console.error);

//             const e2 = cell_strongest_base_value(env) 
//             expect(cell_strongest_base_value(e2.get("out3"))).toBe(2);

//             console.log("changing behavior of closure")
//             run("(network magic2 (>:: x) (::> z) (- x 1 z))", env, undefined, 1);
//             await execute_all_tasks_sequential(console.error)
//             const e3 = cell_strongest_base_value(env) 
//             const out2 = e3.get("out3")
//             console.log(out2.summarize())
//             expect(cell_strongest_base_value(out2)).toBe(0);
//         }); 

//     });
// });

describe("Compiler (compile function) Tests", () => {
    beforeEach(() => {
        init_system_compile()
    });

    /** Unwrap layered value, assert graphology graph, optionally assert every node label starts with prefix. */
    function assertGraphFromCell(
        raw: unknown,
        options?: { labelPrefix?: string; cardId?: string }
    ): void {
        const base = is_layered_object(raw) ? get_base_value(raw as LayeredObject<unknown>) : raw;
        expect(is_graphology_graph(base)).toBe(true);
        const g = base as { forEachNode: (fn: (node: string, attrs: Record<string, unknown>) => void) => void };
        let count = 0;
        g.forEachNode((_node, attrs) => {
            count++;
            const label = attrs?.label;
            expect(typeof label).toBe("string");
            if (options?.labelPrefix) {
                expect((label as string).startsWith(options.labelPrefix)).toBe(true);
            }
            if (options?.cardId) {
                expect((label as string).includes(`CARD|${options.cardId}|`)).toBe(true);
            }
        });
        if (options?.labelPrefix) {
            expect(count).toBeGreaterThanOrEqual(1);
        }
    }

    describe("1. Constants", () => {
        test("should compile string constant", async () => {
            const env = empty_lexical_environment("test");
            const code = '"hello"';
            const result = raw_compile(code, env);
            await execute_all_tasks_sequential(() => {});
            expect(is_cell(result)).toBe(true);
            expect(cell_strongest_base_value(result)).toBe("hello");
        });

        test("should compile number constant", async () => {
            const env = empty_lexical_environment("test");
            const code = "42";
            const result = raw_compile(code, env);
            await execute_all_tasks_sequential(() => {});
            expect(is_cell(result)).toBe(true);
            expect(cell_strongest_base_value(result)).toBe(42);
        });
    });

    describe("2. Symbol Lookup", () => {
        test("should lookup symbol from environment with initial value", async () => {
            const env = construct_env_with_inital_value(
                [["x", ce_constant(1)]],
                "test"
            );
            const code = "x";
            const result = raw_compile(code, env);
            await execute_all_tasks_sequential(() => {});
            expect(is_cell(result)).toBe(true);
            expect(cell_strongest_base_value(result)).toBe(1);
        });
    });

    describe("3. Primitive Propagator Application", () => {
        test("should apply addition primitive propagator", async () => {
            const env = primitive_env();
            raw_compile("(+ 1 2 out)", env);
            await execute_all_tasks_sequential(console.error);
            const e = raw_compile("out", env);
            await execute_all_tasks_sequential(console.error);
            expect(cell_strongest_base_value(e)).toBe(3);
        });

        // test("graph:card: can be called with graph and cardId, writes subgraph with only that card's nodes", async () => {
        //     const env = primitive_env();
        //     raw_compile("(network with_graph (>:: a) (::> g) (graph:trace a g))", env);
        //     await execute_all_tasks_sequential(console.error);
        //     raw_compile("(with_graph 1 g)", env);
        //     await execute_all_tasks_sequential(console.error);
        //     raw_compile('(graph:card g "some-card" sub)', env);
        //     await execute_all_tasks_sequential(console.error);
        //     const e = cell_strongest_base_value(env) as Map<string, Cell<any>>;
        //     const sub = e.get("sub");
        //     expect(sub).toBeDefined();
        //     assertGraphFromCell(cell_strongest_base_value(sub!), { cardId: "some-card" });
        // });

        // test("graph:label: can be called with graph and prefix, writes subgraph where every node label starts with prefix", async () => {
        //     const env = primitive_env();
        //     raw_compile("(network with_graph (>:: a) (::> g) (graph:trace a g))", env);
        //     await execute_all_tasks_sequential(console.error);
        //     raw_compile("(with_graph 1 g)", env);
        //     await execute_all_tasks_sequential(console.error);
        //     raw_compile('(graph:label g "CELL|" cells)', env);
        //     await execute_all_tasks_sequential(console.error);
        //     const e = cell_strongest_base_value(env) as Map<string, Cell<any>>;
        //     const cells = e.get("cells");
        //     expect(cells).toBeDefined();
        //     const val = cell_strongest_base_value(cells!);
        //     assertGraphFromCell(val, { labelPrefix: "CELL|" });
        //     const fullGraph = cell_strongest_base_value(e.get("g")!);
        //     const fullBase = is_layered_object(fullGraph) ? get_base_value(fullGraph as LayeredObject<unknown>) : fullGraph;
        //     expect(is_graphology_graph(fullBase)).toBe(true);
        //     let fullOrder = 0;
        //     (fullBase as { forEachNode: (fn: () => void) => void }).forEachNode(() => { fullOrder++; });
        //     const subBase = is_layered_object(val) ? get_base_value(val as LayeredObject<unknown>) : val;
        //     let subOrder = 0;
        //     (subBase as { forEachNode: (fn: () => void) => void }).forEachNode(() => { subOrder++; });
        //     expect(subOrder).toBeLessThanOrEqual(fullOrder);
        // });

        // test("graph:label with CELL|CARD| returns only card cells (use this prefix in frontend, not \"CARD|\")", async () => {
        //     const { TRACED_GRAPH_LABEL_PREFIX_CARD_CELLS } = await import("../compiler/tracer/graph_queries");
        //     expect(TRACED_GRAPH_LABEL_PREFIX_CARD_CELLS).toBe("CELL|CARD|");
        //     const env = primitive_env();
        //     raw_compile("(network with_graph (>:: a) (::> g) (graph:trace a g))", env);
        //     await execute_all_tasks_sequential(console.error);
        //     raw_compile("(with_graph 1 g)", env);
        //     await execute_all_tasks_sequential(console.error);
        //     raw_compile(`(graph:label g "${TRACED_GRAPH_LABEL_PREFIX_CARD_CELLS}" card_cells)`, env);
        //     await execute_all_tasks_sequential(console.error);
        //     const e = cell_strongest_base_value(env) as Map<string, Cell<any>>;
        //     const cardCells = e.get("card_cells");
        //     expect(cardCells).toBeDefined();
        //     const val = cell_strongest_base_value(cardCells!);
        //     expect(is_graphology_graph(is_layered_object(val) ? get_base_value(val as LayeredObject<unknown>) : val)).toBe(true);
        // });

        // test("graph.nodes: can be called with graph and node list, writes subgraph to output", async () => {
        //     const env = extend_env(primitive_env(), [["empty_ids", ce_constant([])]]);
        //     raw_compile("(network with_graph (>:: a) (::> g) (graph:trace a g))", env);
        //     await execute_all_tasks_sequential(console.error);
        //     raw_compile("(with_graph 1 g)", env);
        //     await execute_all_tasks_sequential(console.error);
        //     raw_compile("(graph:nodes g empty_ids sub)", env);
        //     await execute_all_tasks_sequential(console.error);
        //     const e = cell_strongest_base_value(env) as Map<string, Cell<any>>;
        //     const sub = e.get("sub");
        //     expect(sub).toBeDefined();
        //     const val = cell_strongest_base_value(sub!);
        //     expect(is_graphology_graph(val) || (typeof val === "object" && val !== null && "order" in val)).toBe(true);
        // });
    });

    describe("4. Closure Application", () => {
        test("incremental compiler defines and applies a closure with a stable source", async () => {
            const env = primitive_env();
            const definitionSource = source_constant_cell("compiler-test:add1");
            const applicationSource = source_constant_cell("compiler-test:add1:application");

            run(`(network add1_inc (>:: x) (::> y) (+ x 1 y))`, env, definitionSource, 0);
            await execute_all_tasks_sequential(console.error);

            run("(add1_inc 5 out_inc)", env, applicationSource, 0);
            await execute_all_tasks_sequential(console.error);

            const e = cell_strongest_base_value(env);
            const out = e.get("out_inc");
            expect(out).toBeDefined();
            expect(cell_strongest_base_value(out)).toBe(6);
        });

        test("incremental compiler reloads a network definition for existing applications", async () => {
            const env = primitive_env();
            const definitionSource = source_constant_cell("compiler-test:magic2");
            const applicationSource = source_constant_cell("compiler-test:magic2:application");

            run(`(network magic2_inc (>:: x) (::> z) (+ x 1 z))`, env, definitionSource, 0);
            await execute_all_tasks_sequential(console.error);

            run("(magic2_inc 1 out_reload)", env, applicationSource, 0);
            await execute_all_tasks_sequential(console.error);

            let e = cell_strongest_base_value(env);
            let out = e.get("out_reload");
            expect(out).toBeDefined();
            expect(cell_strongest_base_value(out)).toBe(2);

            run(`(network magic2_inc (>:: x) (::> z) (- x 1 z))`, env, definitionSource, 1);
            await execute_all_tasks_sequential(console.error);

            e = cell_strongest_base_value(env);
            out = e.get("out_reload");
            expect(out).toBeDefined();
            expect(cell_strongest_base_value(out)).toBe(0);
        });

        test("should define and apply a closure", async () => {
            const env = primitive_env();
            raw_compile(`(network add1 (>:: x) (::> y) (+ x 1 y))`, env);
            await execute_all_tasks_sequential(console.error);
            raw_compile("(add1 5 out)", env);
            await execute_all_tasks_sequential(console.error);
            const e = cell_strongest_base_value(env);
            const out = e.get("out");
            expect(out).toBeDefined();
            expect(cell_strongest_base_value(out)).toBe(6);
        });


        test("okay with nested calling", async () => {

            const primEnvCell = primitive_env()
            const env = primEnvCell
            
            // First define a network (closure)
            const defineCode = `(network add1 (>:: x) (::> y) (+ x 1 y))`;
            const defineEnv = raw_compile(defineCode, env);

        
            execute_all_tasks_sequential(console.error)

            const env1 = cell_strongest_base_value(env) as Map<string, Cell<any>>
            
            raw_compile("(add1_again 8 out2)", env)

            execute_all_tasks_sequential(console.error);

            const add1_again = '(network add1_again (>:: x) (::> y) (add1 x y))'
            raw_compile(add1_again, env) 

            await execute_all_tasks_sequential(console.error)
            const e2 = cell_strongest_base_value(env) 
            expect(cell_strongest_base_value(e2.get("out2"))).toBe(9);
        });
    });
});
