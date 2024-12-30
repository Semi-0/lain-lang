// default network to make cells

import { the_nothing, type Cell, type Propagator, type Disposable, type PropagatorFunction, type CellValue } from "../type";
import { primitive_cell, constant_cell, update_cell, trace_cell_chain } from "./cell";
import { cons_cell, car, cdr, map } from "./data_types";
import { construct_compound_propagator, construct_propagator, get_input_cells, get_output_cell, lift_propagator_a, lift_propagator_b } from "./propagator";
import type { Pair } from "./data_types";
import { execute_all, summarize } from "./scheduler";
import { write } from "bun";
import { is_function } from "generic-handler/built_in_generics/generic_predicates";
import { apply_propagator } from "./utility";


export function prop_sugar_transformer(p: (...cells: Cell<any>[]) => Propagator): (...inputs: Cell<any>[]) => Cell<any> {
    return (...inputs: Cell<any>[]) => {
        const output = primitive_cell<any>();
        p(...inputs, output);
        return output;
    }
}

export function p_add_one(a: Cell<number>, o: Cell<number>) {
    return lift_propagator_a((a: number) => a + 1)(a, o);
}

export function p_plus(a: Cell<number>, b: Cell<number>, o: Cell<number>) {
    return lift_propagator_a((a: number, b: number) => a + b)(a, b, o);
}

export function p_minus(a: Cell<number>, b: Cell<number>, o: Cell<number>) {
    return lift_propagator_a((a: number, b: number) => a - b)(a, b, o);
} 

export function p_times(a: Cell<number>, b: Cell<number>, o: Cell<number>) {
    return lift_propagator_a((a: number, b: number) => a * b)(a, b, o);
}

export function p_divide(a: Cell<number>, b: Cell<number>, o: Cell<number>) {
    return lift_propagator_a((a: number, b: number) => a / b)(a, b, o);
}

export function p_equal(a: Cell<any>, b: Cell<any>, o: Cell<boolean>) {
    return lift_propagator_a((a: any, b: any) => a === b)(a, b, o);
}

export function p_cons(ca: Cell<any>, cb: Cell<any>, o: Cell<any>) {
    return lift_propagator_a((a: any, b: any) => 
        cons_cell(ca, cb)
    )(ca, cb, o);
}

export function p_first(c: Cell<Pair<any>>, o: Cell<any>) {
    return lift_propagator_a((c: Pair<any>) => {
        return car(c);
    })(c, o);
}

export function p_rest(c: Cell<Pair<any>>, o: Cell<any>) {
    return lift_propagator_a((c: Pair<any>) => {
        return cdr(c);
    })(c, o);
}

export function p_pass(c: Cell<any>, o: Cell<any>){
    return lift_propagator_a((c: any) => {
        return c;
    })(c, o);
}

export function p_apply(c: Cell<any>, f: Cell<PropagatorFunction>, o: Cell<any>){
    // for garbage collection
    var prev_propagator: Propagator | undefined = undefined;
    return construct_propagator([c, f], [o], (set_children: (children: Disposable[]) => void) => {
        return () => {
            if (is_function(f.value)){     
                //@ts-ignore           

                if (prev_propagator !== undefined){
                    // @ts-ignore
                    prev_propagator.dispose();
                }
                // @ts-ignore
                const p = apply_propagator([c, o], f.value);
        
                prev_propagator = p;
                set_children([p])
            
            }
        }
    })
}


export function pc_simple_loop(c_input: Cell<number>, c_output: Cell<any>): Propagator{
    return construct_compound_propagator([c_input], [c_output], (set_children: (children: Disposable[]) => void) => {
            const c_ten = constant_cell(10); 
            const c_done = primitive_cell<boolean>();
            const c_not_done = primitive_cell<boolean>();
         
            const c_m = primitive_cell()
            const c_r = primitive_cell() 
            const c_two = constant_cell(2);

            p_greater(c_input, c_ten, c_done)
            p_not(c_done, c_not_done)
            p_switch(c_done, c_input, c_output)
            p_times(c_input, c_two, c_m)
            p_switch(c_not_done, c_m, c_input)
            set_children([ c_ten, c_done, c_not_done, c_m, c_r])
            set_children([c_done])
      
    })
}



export function pc_map(c: Cell<Pair<any>>, f: Cell<PropagatorFunction>, o: Cell<any>){
    return construct_compound_propagator([c, f], [o], (set_children: (children: Disposable[]) => void) => {
        
          const done = primitive_cell<boolean>(); 
          const input = primitive_cell<Pair<any>>(); 
          const target = constant_cell(the_nothing);
          const accum = primitive_cell();
          const not_done = primitive_cell<boolean>();
          const cdr_cell = primitive_cell();
          const car_cell = primitive_cell();
          const applied_cell = primitive_cell();
          const copy_accum = primitive_cell();

          // Initialize input with the input list
          p_write(c, input)
          
          p_log(applied_cell, "applied_cell", primitive_cell())
          // Check if we're done
          p_equal(input, target, done)
          p_not(done, not_done)
          
        //   // If done, write result to output
          p_switch(done, accum, o)
          
        //   // If not done, process current element
          p_first(input, car_cell)
          p_apply(car_cell, f, applied_cell)
          
        //   // Build up result
        //   p_write(accum, copy_accum)
        //   p_cons(applied_cell, copy_accum, accum)
          
        //   // Move to next element
        //   p_rest(input, cdr_cell)
        //   p_switch(not_done, cdr_cell, input)

          set_children([done, input, target, accum, not_done, cdr_cell, car_cell, applied_cell, copy_accum])
        
    })
}

export function p_log(c: Cell<any>, tag: string, o: Cell<any>){
    return lift_propagator_a((c: any) => {
        console.log(tag, c);
        return c;
    })(c, o);
}

export function p_when(when: Cell<boolean>, do_function: (c: any) => any, o: Cell<any>){
    return lift_propagator_a((c: any) => {
          if (when.value === true){
            do_function(c);
          }
          return c;
    })(when, o);
}

export function ps_when(when: Cell<boolean>, do_function: (c: any) => any){
    const output = primitive_cell<any>();

    p_when(when, do_function, output);
    return output;
   
}

export function p_not(c: Cell<boolean>, o: Cell<boolean>) {
    return lift_propagator_a((c: boolean) => !c)(c, o);
}

export function p_switch(switch_cell: Cell<boolean>, value_cell: Cell<any>, output_cell: Cell<any>) {
    return lift_propagator_b((next: (update: any) => void, c:boolean, v: any) => {
        if (c === true){
            next(v);
        }
    })(switch_cell, value_cell, output_cell);
}


export function p_write(c: Cell<any>, o: Cell<any>) {
    return lift_propagator_a((c: any) => {
        return c;
    })(c, o);
}




export function p_if(condition: Cell<boolean>, then_cell: Cell<any>, else_cell: Cell<any>, output: Cell<any>) {
    return construct_compound_propagator([condition, then_cell, else_cell], [output], (set_children: (children: Disposable[]) => void) => {
     

            const not_cell: Cell<boolean> = primitive_cell();
            const not_propagator = p_not(condition, not_cell);
            const switch_propagator = p_switch(condition, then_cell, output);
            const switch_not_propagator = p_switch(not_cell, else_cell, output);

            set_children([not_cell, not_propagator, switch_propagator, switch_not_propagator]);

    })
}

export function p_smaller(a: Cell<number>, b: Cell<number>, o: Cell<boolean>) {
    return lift_propagator_a((a: number, b: number) => a < b)(a, b, o);
}

export function p_greater(a: Cell<number>, b: Cell<number>, o: Cell<boolean>) {
    return lift_propagator_a((a: number, b: number) => a > b)(a, b, o);
}


export const ps_cons = prop_sugar_transformer(p_cons);
export const ps_first = prop_sugar_transformer(p_first);
export const ps_rest = prop_sugar_transformer(p_rest);
export const ps_equal = prop_sugar_transformer(p_equal);
export const ps_plus = prop_sugar_transformer(p_plus);
export const ps_not = prop_sugar_transformer(p_not);
export const ps_if = prop_sugar_transformer(p_if);
export const ps_write = prop_sugar_transformer(p_write);
export const ps_smaller = prop_sugar_transformer(p_smaller);


// export function p_length(pairs: Cell<Pair<any>>, o: Cell<number>, start: Cell<number>) {
//     return construct_compound_propagator([pairs], [o], (set_children: (children: Disposable[]) => void) => {
//         // this is not tail recursive
//         const first = ps_first(pairs);
//         const is_done = ps_equal(first, constant_cell(the_nothing));
//         // p_log(is_done, "is_done", primitive_cell());
  
//         ps_when(ps_not(is_done), () => {
//             p_length(ps_rest(ps_write(pairs)), o, ps_plus(ps_write(start), constant_cell(1)));
//         })

//         p_switch(is_done, start, o);
//     })
// }

// boolean 

// loop


// Rule = ["rule", applicability, handler]
// Dispatch Store = ["dispatch_store", rules, default_handler]









// maybe name should not being built into propagator
 
// export function p_construct_generic_propagator(generic_propagator_store_accumulator: Cell<any>){
//     // or id?
//     const constructor = (name: Cell<string>, arity: Cell<number>, default_handler: Propagator) => {
//         const the_generic_propagator = (...args: Cell<any>[]) => {
//             const inputs = get_input_cells(args);
//             const output = get_output_cell(args);
//             return construct_propagator(inputs, [output], () => {
//                     const meta_data = pe_generic_metaData(name, arity, default_handler); 
//                     update_cell(generic_propagator_store_accumulator, meta_data);
//                     p_generic_dispatch(meta_data, args, output)
//             });
//         }
//     }
// }

// export function p_generic_propagator_handler_accumulator_constructor(generic_propagator_store: Cell<any>) {
//     return (new_item: Cell<any>) => {
//         return construct_propagator([new_item, generic_propagator_store], [generic_propagator_store], () => {
//             const c_meta_data = construct_primitive_cell() 
//             p_acc(new_item, c_meta_data)
//         })
//     }
// }

// export function p_acc(new_item: Cell<any>, meta_data: Cell<any>) {
//     return construct_propagator([new_item, meta_data], [new_item], () => {
//          const copy = construct_primitive_cell_with_value(meta_data.value)
//          p_cons(new_item, copy, meta_data)
//     })
// }

// export function p_generic_dispatch(meta_data: Cell<Pair<any>>, args: Cell<any>[], output: Cell<any>) {
//     return construct_propagator([meta_data, ...args], [output], () => {
//             const matched_propagator = construct_primitive_cell()
//             p_get_handler(meta_data, args, matched_propagator)
//             p_apply_handler(matched_propagator, args, output)
//     })
// }

// const a = construct_primitive_cell_with_value(0)("a");
// const b = construct_primitive_cell_with_value(2)("b");
// const c = construct_primitive_cell_with_value(0)("c");

// const p = p_plus(a, b, c);

// const pair_1 = construct_primitive_cell()("pair_1");
// const pair_2 = construct_primitive_cell()("pair_2");
// const cons_2 = cons(b, c, pair_1);
// const cons_1 = cons(a, pair_1, pair_2); 

// const first_1 = construct_primitive_cell()("first_1");
// // @ts-ignore
// const first_2 = first(pair_2, first_1);

// const rest_1 = construct_primitive_cell()("rest_1");
// const rest_prop = rest(pair_2, rest_1);
// // @ts-ignore
// const rest_2 = construct_primitive_cell()("rest_2");
// const rest_prop2 = rest(rest_1, rest_2);

// a.value = 3;
// execute_all();

// console.log(rest_2.value);
