import { expect, test, describe, beforeEach } from "bun:test";
import { run } from "../compiler/compiler_entry";
import { is_cell } from "ppropogator/Cell/Cell";
import { renderCellGraph } from "../compiler/graph_renderer";
import { execute_all_tasks_sequential, reactive_mode, run_immediate } from "ppropogator";
import { set_global_state, PublicStateCommand } from "ppropogator/Shared/PublicState";
import { set_merge, generic_merge, merge_layered } from "ppropogator/Cell/Merge";
import { set_handle_contradiction } from "ppropogator/Cell/Cell";
import { primitive_env } from "../compiler/closure";

describe("Graph Renderer - REPL Scenario", () => {
    beforeEach(() => {
        // Setup from compiler.test.ts
        set_global_state(PublicStateCommand.RESET);
        set_merge(generic_merge(merge_layered));
        set_handle_contradiction(() => {});
        reactive_mode();
        run_immediate();
    });

    test("should render graph from REPL code without stack overflow", async () => {
        const env = primitive_env();
        
        // Simple expression like in REPL
        const code = "(define a 1)";
        
        console.log("Running code:", code);
        const result = run(code, env);
        
        await execute_all_tasks_sequential(() => {});
        
        console.log("Result is cell:", is_cell(result));
        
        if (is_cell(result)) {
            console.log("Rendering graph...");
            try {
                const graphOutput = await renderCellGraph(result, {
                    width: 160,
                    height: 80,
                    ticks: 200
                });
                
                console.log("Graph rendered successfully!");
                console.log("Output length:", graphOutput.length);
                console.log("First 200 chars:", graphOutput.substring(0, 200));
                
                expect(graphOutput).toBeTruthy();
                expect(graphOutput.length).toBeGreaterThan(0);
                expect(graphOutput).not.toContain("Maximum call stack");
            } catch (e) {
                console.error("Graph rendering error:", e);
                throw e;
            }
        } else {
            console.log("Result is not a cell, skipping graph render");
        }
    }, 15000);

    test("should render graph from complex expression", async () => {
        const env = primitive_env();
        
        // More complex expression
        const code = "(+ 1 2)";
        
        console.log("Running code:", code);
        const result = run(code, env);
        
        await execute_all_tasks_sequential(() => {});
        
        if (is_cell(result)) {
            console.log("Rendering complex graph...");
            try {
                const graphOutput = await renderCellGraph(result);
                
                console.log("Complex graph rendered!");
                console.log("Output length:", graphOutput.length);
                
                expect(graphOutput).toBeTruthy();
                expect(graphOutput).not.toContain("Maximum call stack");
            } catch (e) {
                console.error("Error:", e);
                throw e;
            }
        }
    }, 15000);

    test("should render graph from map accessor (like ?? a)", async () => {
        const env = primitive_env();
        
        // First define a variable
        run("(define a 1)", env);
        await execute_all_tasks_sequential(() => {});
        
        // Then query it - this returns a cell with neighbors
        const code = "(?? a)";
        console.log("Running code:", code);
        const result = run(code, env);
        
        await execute_all_tasks_sequential(() => {});
        
        console.log("Result is cell:", is_cell(result));
        
        if (is_cell(result)) {
            console.log("Rendering map accessor graph...");
            try {
                const graphOutput = await renderCellGraph(result, {
                    width: 160,
                    height: 80,
                    ticks: 200
                });
                
                console.log("Map accessor graph rendered!");
                console.log("Output length:", graphOutput.length);
                
                expect(graphOutput).toBeTruthy();
                expect(graphOutput).not.toContain("Maximum call stack");
            } catch (e) {
                console.error("Stack overflow error:", e);
                throw e;
            }
        } else {
            throw new Error("Expected (?? a) to return a cell");
        }
    }, 15000);
});
