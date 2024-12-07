// default network to make cells
import type { Cell, Propagator } from "../type";
import { construct_propagator } from "./propagator";
import { is_contradiction, is_nothing } from "../shared/predicates";
import { construct_primitive_cell } from "./cell";
import { the_contradiction } from "../type";

export const default_equal = (...cells: Cell<any>[]): Propagator => {
    if (cells.length !== 3) {
        throw new Error("default_equal expects 3 cells");
    }
    
    return construct_propagator("default_equal", cells, () => {
        cells[2].value = cells[0].value === cells[1].value;
    });
}

export const default_merge = (...cells: Cell<any>[]): Propagator => {
    if (cells.length !== 2) {
        throw new Error("default_merge expects 2 cells");
    }

    return construct_propagator("default_merge", cells, () => {
       const o = cells[1];
       const i = cells[0];
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
           const equal = default_equal(i, o, e);

           if (e.value !== true) {
            o.value = the_contradiction;
           }
           equal.disposer();
       }
    });
}

export const default_strongest = (...cells: Cell<any>[]): Propagator => {
    if (cells.length !== 2) {
        throw new Error("default_strongest expects 2 cells");
    }

    return construct_propagator("default_strongest", cells, () => {
        cells[0].value = cells[1].value;
    });
}

export const default_handle_contradiction = (...cells: Cell<any>[]): Propagator => {
    if (cells.length !== 1) {
        throw new Error("default_handle_contradiction expects 1 cell");
    }

    return construct_propagator("default_handle_contradiction", cells, () => {
        console.log("contradiction: ", cells);
    });
}
