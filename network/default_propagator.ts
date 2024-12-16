// default network to make cells

import type { Cell } from "../type";
import { construct_primitive_cell, construct_primitive_cell_with_value, update_cell } from "./cell";
import { construct_pair, get_fst, get_snd } from "./data_types";
import { lift_propagator_a } from "./propagator";
import type { Pair } from "./data_types";
import { execute_all, summarize } from "./scheduler";

export function p_plus(a: Cell<number>, b: Cell<number>, o: Cell<number>) {
    return lift_propagator_a("plus", (a: number, b: number) => a + b)(a, b, o);
}

export function cons(ca: Cell<any>, cb: Cell<any>, o: Cell<any>) {
    return lift_propagator_a("cons", (a: any, b: any) => 
        construct_pair(ca, cb)
    )(ca, cb, o);
}

export function first(c: Cell<Pair<any>>, o: Cell<any>) {
    return lift_propagator_a("first", (c: Pair<any>) => {
        return get_fst(c);
    })(c, o);
}

export function rest(c: Cell<Pair<any>>, o: Cell<any>) {
    return lift_propagator_a("rest", (c: Pair<any>) => {
        return get_snd(c);
    })(c, o);
}


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
