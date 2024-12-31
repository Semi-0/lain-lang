import { primitive_cell, constant_cell, update_cell, trace_cell_chain } from "../network/cell";
import { describe, it, expect } from 'bun:test';
import { p_divide, p_minus, p_plus, p_times, p_cons, p_first, p_rest, p_switch, prop_sugar_transformer, p_log, p_if,  ps_equal, ps_smaller, ps_write, ps_plus, ps_not, p_write, ps_when, p_when, pc_simple_loop, pc_map, p_add_one } from "../network/default_propagator";
import { clear_scheduler, execute_all, summarize } from "../network/scheduler";
import { cons_cell, car, cdr, type Pair } from "../network/data_types";
import { ps_cons, ps_first, ps_rest } from "../network/default_propagator";
import { the_nothing, type Cell, type Propagator, type PropagatorFunction } from "../type";
import { constant } from "fp-ts/lib/function";
import { construct_compound_propagator } from "../network/propagator";
import { lift_propagator_a } from "../network/propagator";
import { p_apply } from "../network/default_propagator";
import { beforeEach, afterEach } from "bun:test";
import { tell_cell } from "../interpreter/propagator_wrapper";
import { dispose } from "../network/dispose";

describe('Basic Arithmetic', () => {
    it("basic arithmetic plus", () => {
        const a = primitive_cell<number>();
        const b = constant_cell(2);
        const c = primitive_cell<number>();
        const d = constant_cell(4);
        const e = primitive_cell<number>();

        const p = p_plus(a, b, c);
        const q = p_plus(c, d, e);
        update_cell(a, 1);
        execute_all();

        expect(c.value).toBe(3);
        expect(e.value).toBe(7);

    })

    it("basic arithmetic minus", () => {    
        const a = primitive_cell<number>();
        const b = constant_cell(2);
        const c = primitive_cell<number>();
        const d = constant_cell(4);
        const e = primitive_cell<number>();

        const p = p_minus(a, b, c);
        update_cell(a, 1);
        execute_all();

        expect(c.value).toBe(-1);
    })

    it("basic arithmetic times", () => {    
        const a = primitive_cell<number>();
        const b = constant_cell(2);
        const c = primitive_cell<number>();
        const d = constant_cell(4);
        const e = primitive_cell<number>();

        const p = p_times(a, b, c);
        update_cell(a, 1);
        execute_all();

        expect(c.value).toBe(2);
    })

    it("basic arithmetic divide", () => {
        const a = primitive_cell<number>();
        const b = constant_cell(2);
        const c = primitive_cell<number>();
        const d = constant_cell(4);
        const e = primitive_cell<number>();

        const p = p_divide(a, b, c);
        const q = p_divide(c, d, e);

        update_cell(a, 1);
        execute_all();

        expect(c.value).toBe(0.5);
        expect(e.value).toBe(0.125);
    })  
})  


describe('sugar transformer', () => {
    it("sugar transformer", () => {

        const pe_plus = prop_sugar_transformer(p_plus);

        const a = constant_cell(1);
        const b = constant_cell(2);
     
        const c = pe_plus(a, b);
        update_cell(a, 1);
        execute_all();
        expect(c.value).toBe(3);
    })
})


describe('Pair', () => {
    it("basic cons", () => {
        const a = primitive_cell<number>();
        const b = constant_cell(2);
        const p = primitive_cell<Pair<number>>();
        const pc = p_cons(a, b, p);


        const first = primitive_cell<number>();
        const rest = primitive_cell<number>();
        const pf = p_first(p, first);
        const pr = p_rest(p, rest);
        update_cell(a, 1);
        execute_all();
        expect(first.value).toBe(1);
        expect(rest.value).toBe(2);
       
    })

    it("basic cons update", () => {
        const a = constant_cell(1);
        const b = constant_cell(2);
        const p = primitive_cell<Pair<number>>();
        const pc = p_cons(a, b, p);
        const should_be_a = primitive_cell<number>();
        const should_be_b = primitive_cell<number>();
        const pa = p_first(p, should_be_a);
        const pb = p_rest(p, should_be_b);
        update_cell(b, 3);
        execute_all();
        expect(should_be_a.value).toBe(1);
        expect(should_be_b.value).toBe(3);
    })

    it("cons with other pair", () => {
        const a = constant_cell(5);
        const b = constant_cell(2);
 
        const d = constant_cell(4);
        
        const result = ps_cons(a, ps_cons(b, d))
        update_cell(a, 1);
        update_cell(b, 3);
        update_cell(d, 4)
     

        const should_be_a = ps_first(result)
        const should_be_d = ps_rest(ps_rest(result))
        execute_all();
  
        expect(should_be_a.value).toBe(1);
        expect(should_be_d.value).toBe(4);
    })

    it("cdr get nothing", () => {
        const a = constant_cell(5);
        const b = constant_cell(2);
 
        const d = constant_cell(4);
        
        const result = ps_cons(a, ps_cons(b, d))
        update_cell(a, 1);
     

        const should_be_a = ps_first(result)
        const should_be_nothing = ps_rest(ps_rest(ps_rest(result)))
        execute_all();
  
        expect(should_be_a.value).toBe(1);
        expect(should_be_nothing.value).toBe(the_nothing);
    })


    it("cons multiple pairs", () => {
        const a = constant_cell(1);
        const b = constant_cell(2);
        const c = constant_cell(3);
        const d = constant_cell(4);
     
        const result = ps_cons(ps_cons(a, b), ps_cons(c, d))

        update_cell(a, 5);
  
        const should_be_a = ps_first(ps_first(result))
     
        execute_all();
 
        expect(should_be_a.value).toBe(5);
    
    })
})


describe("switch", () => {
    it("switch", () => {
        const a = constant_cell(false)
        const b = constant_cell(2);
        const c = primitive_cell<number>();
        expect(c.value).toBe(the_nothing);
        const p = p_switch(a, b, c);

        execute_all();
        expect(c.value).toBe(the_nothing);
        
        update_cell(a, true);
        execute_all();
        expect(c.value).toBe(2);
    })
})


describe("compound propagator", () => {
    it("basic compound propagator", () => {
        const a = constant_cell(1);
        const b = constant_cell(2);
        const c = primitive_cell<number>();
        const compound = construct_compound_propagator(new Set([a, b]), new Set([c]), () => {
     
            const p: Propagator = p_plus(a, b, c); 
          
       
        })

        update_cell(a, 1);
        execute_all();

        expect(c.value).toBe(3);

        update_cell(b, 4);
        execute_all();
        expect(c.value).toBe(5);
    })

        it("if", () => {
            const a = constant_cell(true);
            const b = constant_cell(2);
            const c = constant_cell(3);
            const d = primitive_cell<number>();
            const p = p_if(a, b, c, d);
            execute_all();
            expect(d.value).toBe(2);

            update_cell(a, false);
            execute_all();
            expect(d.value).toBe(3);
        })

        it("simple loop", () => {
            const a = constant_cell(1);
            const f = primitive_cell<number>();
            const p = pc_simple_loop(a, f);
            update_cell(a, 3);
            execute_all();
            expect(f.value).toBe(12);
        })

describe("pc_map", () => {
    it("should map a function over a list of numbers", () => {
        // Create input cells
        const output = primitive_cell();
        const add_one = primitive_cell<PropagatorFunction>();

        // Build input list: [1, 2, 3]
        const three = ps_cons(constant_cell(3), constant_cell(the_nothing));
        const two = ps_cons(constant_cell(2), three);
        const one = ps_cons(constant_cell(1), two);
        
        // Set input and create map propagator
        tell_cell(add_one, p_add_one);
        pc_map(one, add_one, output);
        
        // Execute propagator network
        execute_all();

        // Expected: [2, 3, 4]
        console.log("output", output.value)
        const result = output.value;
        
        // Helper function to convert linked list to array
        const listToArray = (pair: any): any[] => {
            const results = [];
            let current = pair;
           
            while (current !== undefined && car(current) !== the_nothing) {
                //  console.log(results)
                results.push(car(current));
                current = cdr(current);
            }
            return results;
        };

        expect(listToArray(result)).toEqual([2, 3, 4]);
    });
}); 


        // it("length", () => {
        //     const a = constant_cell(1);
        //     const b = constant_cell(2);
        //     const c = constant_cell(3);
        //     const d = constant_cell(4);
        //     const e = constant_cell(5);
        //     const f = primitive_cell<number>();
        //     // a legal form should always have a nothing at the end
        //     const p = ps_cons(a, ps_cons(b, ps_cons(c, ps_cons(d, ps_cons(e, f)))))

        //     const l = primitive_cell<number>();
        //     const pl = p_length(p, l, constant_cell(0));
        //     execute_all();

        //     expect(l.value).toBe(5);

        //     const a1 = constant_cell(1);
        //     const b1 = constant_cell(2); 

        //     const p1 = ps_cons(a1, ps_cons(b1, constant_cell(the_nothing)))
        //     execute_all();
        //     update_cell(f, p1.value);
        //     execute_all();
        
        //     expect(l.value).toBe(7);
        // })
})

describe("disposal", () => {

    it("should dispose of a propagator", () => {
        const a = primitive_cell<number>();
        const b = primitive_cell<number>();
        const c = primitive_cell<number>();
        const p = p_plus(a, b, c);
        dispose(p);
        update_cell(a, 1);
        update_cell(b, 2);
        execute_all();
        expect(c.value).toBe(the_nothing);
    })

    it("should dispose compound propagator", () => {
        const a = primitive_cell<number>();
        const b = primitive_cell<number>();
        const c = primitive_cell<number>();
        const compound = construct_compound_propagator(new Set([a, b]), new Set([c]), () => {
            const p = p_plus(a, b, c);
        });
        dispose(compound);
        update_cell(a, 1);
        update_cell(b, 2);
        execute_all();
        expect(c.value).toBe(the_nothing);
    })


    it("should properly dispose and allow garbage collection", async () => {
        // Get initial memory usage
        clear_scheduler();
        const initialMemory = process.memoryUsage().heapUsed;
        
        // Create and dispose of many propagators to make memory difference more noticeable
        for (let i = 0; i < 30000; i++) {
            const a = constant_cell(1);
            const b = constant_cell(2);
            const c = primitive_cell<number>();
            
            const compound = construct_compound_propagator(new Set([a, b]), new Set([c]), () => {
                const p = p_plus(a, b, c);
            });

            execute_all();
            
            // Dispose of everything
            dispose(compound);
            dispose(c);
            dispose(a);
            dispose(b);
            clear_scheduler();
        }

        // Force garbage collection
        if (global.gc) {
            global.gc();
        }
        console.log(summarize())

        // Wait a bit to ensure GC has run
        await new Promise(resolve => setTimeout(resolve, 100));

        // Get final memory usage
        const finalMemory = process.memoryUsage().heapUsed;
        
        // Check that memory usage hasn't grown significantly
        // Allow for some overhead, but should be well under 1MB of growth
        expect(finalMemory - initialMemory).toBeLessThan(1024 * 1024);
    });

    it("should show consistent memory usage across multiple runs", async () => {
        const memorySnapshots = [];
        
        for (let run = 0; run < 5; run++) {
            clear_scheduler();
            const beforeRun = process.memoryUsage().heapUsed;
            
            // Run the test multiple times
            for (let i = 0; i < 10000; i++) {
                const a = constant_cell(1);
                const b = constant_cell(2);
                const c = primitive_cell<number>();
                // ... rest of test logic ...
            }
            
            if (global.gc) global.gc();
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const afterRun = process.memoryUsage().heapUsed;
            memorySnapshots.push(afterRun - beforeRun);
        }
        
        // Check that memory usage is consistent between runs
        const maxDiff = Math.max(...memorySnapshots) - Math.min(...memorySnapshots);
        expect(maxDiff).toBeLessThan(500 * 1024); // 500KB variance allowed
    });

    it("should release references properly", () => {
        let a = constant_cell(1);
        let b = constant_cell(2);
        let c = primitive_cell<number>();
        
        let compound = construct_compound_propagator(new Set([a, b]), new Set([c]), 
            () => {
                const p = p_plus(a, b, c);
            });

        // Store weak references
        const weakA = new WeakRef(a);
        const weakB = new WeakRef(b);
        const weakC = new WeakRef(c);
        const weakCompound = new WeakRef(compound);

        // Dispose everything
        dispose(compound);
        dispose(c);
        dispose(a);
        dispose(b);
        clear_scheduler();

        // Clear references
        //@ts-ignore
        compound = null;
        //@ts-ignore
        a = null;
        //@ts-ignore
        b = null;
        //@ts-ignore
        c = null;

        if (global.gc) global.gc();

        // Check that weak references are gone
        expect(weakA.deref()).toBeUndefined();
        expect(weakB.deref()).toBeUndefined();
        expect(weakC.deref()).toBeUndefined();
        expect(weakCompound.deref()).toBeUndefined();
    });
});

describe("p_apply", () => {
    it("should apply a lifted propagator function to a cell value", () => {
        // Setup
        const input = primitive_cell<number>();
        const output = primitive_cell<number>();
        
        // Create add_one using lift_propagator_a
        const add_one = lift_propagator_a((x: number) => x + 1);
        const funcCell = constant_cell(add_one);

        // Create the apply propagator
        p_apply(input, funcCell, output);

        // Test initial application
        input.value = 5;
        execute_all();
        expect(output.value).toBe(6);


        // Test with a different input
        input.value = 10;
        execute_all();
        expect(output.value).toBe(11);
    });

    it("should handle switching between different lifted propagator functions", () => {
        // Setup
        const input = primitive_cell<number>();
        const output = primitive_cell<number>();
        const funcCell = primitive_cell<PropagatorFunction>();
        
        // Create two different propagator functions
        const add_one = lift_propagator_a((x: number) => x + 1);
        const multiply_by_two = lift_propagator_a((x: number) => x * 2);

        // Create the apply propagator
        p_apply(input, funcCell, output);

        // Test with add_one function
        input.value = 5;
        funcCell.value = add_one;
        execute_all();
        expect(output.value).toBe(6);

        // Test with multiply_by_two function
        funcCell.value = multiply_by_two;
        execute_all();
        expect(output.value).toBe(10);

        // Test that it continues to work with new inputs
        input.value = 7;
        execute_all();
        expect(output.value).toBe(14);
    });

    it("should properly clean up when disposed", () => {
        // Setup
        const input = primitive_cell<number>();
        const output = primitive_cell<number>();
        const funcCell = constant_cell(lift_propagator_a((x: number) => x + 1));

        // Create the apply propagator
        const propagator = p_apply(input, funcCell, output);

        // Test initial state
        input.value = 5;
        execute_all();
        expect(output.value).toBe(6);

        // Dispose of the propagator
        dispose(output);

        // Update input - should not affect output anymore
        input.value = 10;
        execute_all();
        expect(output.value).toBe(6); // Output should remain unchanged
    });
});