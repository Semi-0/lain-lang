import { primitive_cell, constant_cell, update_cell, trace_cell_chain } from "../network/cell";
import { describe, it, expect } from 'bun:test';
import { p_divide, p_minus, p_plus, p_times, p_cons, p_first, p_rest, p_switch, prop_sugar_transformer, p_tap, p_if } from "../network/default_propagator";
import { execute_all, summarize } from "../network/scheduler";
import { construct_pair, get_fst, get_snd, type Pair } from "../network/data_types";
import { ps_cons, ps_first, ps_rest } from "../network/default_propagator";
import { the_nothing } from "../type";
import { constant } from "fp-ts/lib/function";
import { construct_compound_propagator } from "../network/propagator";



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
    it("compound propagator", () => {
        const a = constant_cell(1);
        const b = constant_cell(2);
        const c = primitive_cell<number>();
        const compound = construct_compound_propagator([a, b], [c], () => {
           p_plus(a, b, c); 
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
})