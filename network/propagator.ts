import type { Cell, Propagator, Disposable } from "../type";
import { reference_store } from "../shared/helper";
import { add_propagator, update_cell, remove_propagator } from "./cell";

const get_new_id = reference_store();

// perhaps propagator should be defaultly anonymous?
export function construct_propagator(
    inputs: Cell<any>[], 
    outputs: Cell<any>[],
    activate: (set_children: (children: Disposable[]) => void) => () => void
): Propagator{

    var children: Disposable[] = [];

    var act: () => void = activate(set_children);

    function set_children(new_children: Disposable[]){
        children = new_children;
    }

    const propagator: Propagator = {
        id: get_new_id().toString(),
        inputs: inputs,
        outputs: outputs,
        activate: act,
        children,
        dispose: () => {
            act = () => {};

            children.forEach(child => {
                child.dispose();
            });
            children = [];

            inputs.forEach(cell => {
                remove_propagator(cell, propagator);
            });


            if (global.gc) {
                global.gc();
            }
        }
    }

    inputs.forEach(cell => {
        add_propagator(cell, propagator);
    });
    return propagator;
}

// gabage collection perhaps pass a propagator and cell constructor and keep them tracked?
// perhaps use prototype to pass env as a local object
export function construct_compound_propagator(
    inputs: Cell<any>[], 
    outputs: Cell<any>[],
    activate: (set_children: (children: Disposable[]) => void) => void
): Propagator{
    var built = false;

    const propagator = construct_propagator(inputs, outputs, (set_children: (children: Disposable[]) => void) => {
        return () => { 
            if (!built) {
                console.log("activate compound propagator a")
                activate(set_children);
                built = true;
            }
        }
    });


    return propagator;
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
        return construct_propagator(inputs, outputs, 
            (set_children: (children: Disposable[]) => void) => {
                return () => {
                    update_cell(outputs[0], f(...inputs.map(c => c.value)));
                }
            }
        );
    }
}

export function lift_propagator_b<E>(f: (next: (update: E) => void, ...args: any[]) => void) {

    return (...args: any[]) => {
       const inputs = get_input_cells(args);
       const output = get_output_cell(args);

       return construct_propagator(inputs, [output], (set_children: (children: Disposable[]) => void) => {
            return () => {
                const next = (update: E) => {
                    update_cell(output, update);
                }

                f(next, ...inputs.map(c => c.value));
            }
       })
    }


//    return lift_propagator_a((...args: any[]) => {
//     const next = (update: E) => {
//         update_cell(get_output_cell(args), update);
//     }
//     return f(next, ...args);
//    });
}

