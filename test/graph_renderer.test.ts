import { expect, test, describe } from "bun:test";
import { construct_cell as make_cell, cell_id } from "ppropogator/Cell/Cell";
import { p_add, update as update_cell } from "ppropogator";
import { trace_cell } from "ppropogator/Shared/GraphTraversal";
import { 
    propagator_to_links, 
    traced_result_to_graph,
    renderCellGraph,
    name_tracer
} from "../compiler/graph_renderer";

describe("Graph Renderer", () => {
    test("should convert propagator to links without stack overflow", () => {
        const a = make_cell("a");
        const b = make_cell("b");
        const c = make_cell("c");
        
        // Create a simple propagator
        const add_prop = p_add(a, b, c);
        
        // This should not cause stack overflow
        const links = propagator_to_links(add_prop);
        
        expect(Array.isArray(links)).toBe(true);
        expect(links.length).toBeGreaterThan(0);
        console.log("propagator_to_links OK, links:", links.length);
    });

    test("should trace simple cell without stack overflow", () => {
        const a = make_cell("a");
        const b = make_cell("b");
        const c = make_cell("c");
        
        p_add(a, b, c);
        update_cell(a, 1);
        update_cell(b, 2);
        
        // Trace the cell
        const result = trace_cell(c);
        
        console.log("Traced cells:", result.cells.size);
        console.log("Traced propagators:", result.propagators.size);
        
        expect(result.cells.size).toBeGreaterThan(0);
        // Propagators might be 0 if not traced - that's OK
    });

    test("should convert traced result to graph without stack overflow", () => {
        const a = make_cell("a");
        const b = make_cell("b");
        const c = make_cell("c");
        
        p_add(a, b, c);
        update_cell(a, 1);
        update_cell(b, 2);
        
        const result = trace_cell(c);
        
        console.log("Converting to graph...");
        
        // This is where the stack overflow might occur
        try {
            const graph = name_tracer(result);
            console.log("Graph nodes:", graph.nodes.length);
            console.log("Graph links:", graph.links.length);
            
            expect(graph.nodes.length).toBeGreaterThan(0);
            // Links might be 0 if no propagators traced - that's OK
        } catch (e) {
            console.error("Error in name_tracer:", e);
            throw e;
        }
    });

    test("should render cell graph without stack overflow", async () => {
        const a = make_cell("a");
        const b = make_cell("b");
        const c = make_cell("c");
        
        p_add(a, b, c);
        update_cell(a, 1);
        update_cell(b, 2);
        
        console.log("Rendering cell graph...");
        
        try {
            const graphOutput = await renderCellGraph(c, {
                width: 80,
                height: 40,
                ticks: 100
            });
            
            console.log("Graph rendered successfully");
            console.log("Output length:", graphOutput.length);
            
            expect(graphOutput).toBeTruthy();
            expect(graphOutput.length).toBeGreaterThan(0);
        } catch (e) {
            console.error("Error rendering graph:", e);
            throw e;
        }
    }, 10000); // 10 second timeout
});
