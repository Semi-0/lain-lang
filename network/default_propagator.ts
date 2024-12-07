// default network to make cells
import type { Cell, Propagator } from "../type";
import { construct_propagator } from "./propagator";
import { is_contradiction, is_nothing } from "../shared/predicates";
import { construct_primitive_cell } from "./cell";
import { the_contradiction } from "../type";

export const default_equal = (input: Cell<any>[], output: Cell<any>[]): Propagator => {
    return construct_propagator("default_equal", input, output, () => {
        output[0].value = input[0].value === input[1].value;
    });
}

export const default_merge = (input: Cell<any>[], output: Cell<any>[]): Propagator => {
    return construct_propagator("default_merge", input, output, () => {
       const o = output[0];
       const i = input[0];
       if (is_nothing(o.value)) {
            o.value = i.value;
       }
       else if (is_nothing(i.value)) {
            i.value = o.value;
       }
       else if (is_contradiction(i.value)) {
            i.value = o.value;
       }
       else if (is_contradiction(o.value)) {
            o.value = i.value;
       }
       else{
           const e = construct_primitive_cell(false);
           const equal = default_equal([i, o], [e]);
           if (e.value !== true) {
            o.value = the_contradiction;
           }
           equal.disposer();
       }
    });
}

export const default_strongest = (input: Cell<any>[], output: Cell<any>[]): Propagator => {
    return construct_propagator("default_strongest", input, output, () => {
        output[0].value = input[0].value;
    });
}

export const default_handle_contradiction = (input: Cell<any>[], output: Cell<any>[]): Propagator => {
    return construct_propagator("default_handle_contradiction", input, output, () => {
        console.log("contradiction: ", input);
    });
}
