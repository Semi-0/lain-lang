import type { Cell, Propagator } from "../type";
import { reference_store } from "../shared/helper";
import { update_cell } from "./cell";

const get_new_id = reference_store();

// perhaps propagator should be defaultly anonymous?
export function construct_propagator(
                                    inputs: Cell<any>[], 
                                    outputs: Cell<any>[],
                                    activate: () => void): Propagator{
    const propagator: Propagator = {
        id: get_new_id().toString(),

        inputs: inputs,
        outputs: outputs,
        activate: activate,
    }

    inputs.forEach(cell => {
        cell.neighbors.push(propagator);
    });
    return propagator;
}

export function construct_compound_propagator(
    inputs: Cell<any>[], 
    outputs: Cell<any>[],
    activate: () => void): Propagator{
    var built = false;
    return construct_propagator(inputs, outputs, () => {
        if (!built) {
            activate();
            built = true;
        }
    });
}

export function get_output_cell<E>(cells: Cell<any>[]) {
    return cells[cells.length - 1];
}

export function get_input_cells<E>(cells: Cell<any>[]) {
    return cells.slice(0, cells.length - 1);
}

export function lift_propagator_a<E>(f: (...args: any[]) => E) {
    return (...cells: Cell<any>[]) => {
        const inputs = get_input_cells(cells);
        const outputs = [get_output_cell(cells)];
        return construct_propagator(inputs, outputs, () => {
            update_cell(outputs[0], f(...inputs.map(c => c.value)));
        });
    }
}

export function lift_propagator_b<E>(f: (next: (update: E) => void) => void) {
   return lift_propagator_a((...args: any[]) => {
    const next = (update: E) => {
        get_output_cell(args).value = update;
    }
    return f(next);
   });
}
