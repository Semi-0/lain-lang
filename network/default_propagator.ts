// default network to make cells

import type { Cell, Propagator } from "../type";
import { primitive_cell, constant_cell, update_cell } from "./cell";
import { construct_pair, get_fst, get_snd } from "./data_types";
import { construct_compound_propagator, construct_propagator, get_input_cells, get_output_cell, lift_propagator_a, lift_propagator_b } from "./propagator";
import type { Pair } from "./data_types";
import { execute_all, summarize } from "./scheduler";


export function prop_sugar_transformer(p: (...cells: Cell<any>[]) => Propagator): (...inputs: Cell<any>[]) => Cell<any> {
    return (...inputs: Cell<any>[]) => {
        const output = primitive_cell<any>();
        p(...inputs, output);
        return output;
    }
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

export function p_cons(ca: Cell<any>, cb: Cell<any>, o: Cell<any>) {
    return lift_propagator_a((a: any, b: any) => 
        construct_pair(ca, cb)
    )(ca, cb, o);
}

export function p_first(c: Cell<Pair<any>>, o: Cell<any>) {
    return lift_propagator_a((c: Pair<any>) => {
        return get_fst(c);
    })(c, o);
}

export function p_rest(c: Cell<Pair<any>>, o: Cell<any>) {
    return lift_propagator_a((c: Pair<any>) => {
        return get_snd(c);
    })(c, o);
}

export function p_tap(c: Cell<any>, tag: string, o: Cell<any>){
    return lift_propagator_a((c: any) => {
        console.log(tag, c)
        return c;
    })(c, o);
}


export const ps_cons = prop_sugar_transformer(p_cons);
export const ps_first = prop_sugar_transformer(p_first);
export const ps_rest = prop_sugar_transformer(p_rest);

export function p_switch(switch_cell: Cell<boolean>, value_cell: Cell<any>, output_cell: Cell<any>) {
    return lift_propagator_b((next: (update: any) => void, c:boolean, v: any) => {
        if (c === true){
            next(v);
        }
    })(switch_cell, value_cell, output_cell);
}
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
