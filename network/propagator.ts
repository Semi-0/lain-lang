import type { Cell, Propagator,  Relation } from "../type";
import { reference_store } from "../shared/helper";
import { add_neighbor, update_cell, remove_neighbor, cell_id } from "./cell";
import { construct_relation, get_children } from "./relation";
import { add_primitive, get_global_parent, global_env, parameterize, set_global_parent } from "./global";
import { v4 as uuidv4 } from 'uuid';

import { get_id } from "./relation";
import { define_generic_procedure_handler } from "generic-handler/GenericProcedure";
import { is_propagator } from "../shared/predicates";
import { to_string } from "generic-handler/built_in_generics/generic_conversation";
import { match_args } from "generic-handler/Predicates";
import { reduce } from "generic-handler/built_in_generics/generic_array_operation";
// perhaps propagator should be defaultly anonymous?
export function construct_propagator(
    inputs: Set<Cell<any>>, 
    outputs: Set<Cell<any>>,
    activate: () => void
): Propagator{
    var relation: Relation = construct_relation(uuidv4(), get_global_parent());

    const propagator: Propagator = {
        relation: relation,
        inputs: inputs,
        outputs: outputs,
        activate: () => {
            parameterize(() => {set_global_parent(propagator.relation)}, () => {
                activate();
            })
        },
        equals: (x: Propagator, y: Propagator) => {
            return get_id(x.relation) === get_id(y.relation);
        }
    }
 

    add_primitive(relation.get_id(), propagator);

    inputs.forEach(cell => {
        add_neighbor(cell, propagator);
    });
    return propagator;
}


define_generic_procedure_handler(to_string, match_args(is_propagator), (propagator: Propagator) => {
    const inputs = Array.from(propagator.inputs).map(input => to_string(input)).join(', ');
    const outputs = Array.from(propagator.outputs).map(output => to_string(output)).join(', ');
    return 'Propagator(' + propagator.relation.get_id() + ')' + ' with ' + inputs + ' inputs and ' + outputs + ' outputs' ;
})


// gabage collection perhaps pass a propagator and cell constructor and keep them tracked?
// perhaps use prototype to pass env as a local object
// how to not build when tail recursive?
export function construct_compound_propagator(
    inputs: Set<Cell<any>>, 
    outputs: Set<Cell<any>>,
    activate: () => void
): Propagator{
    var built = false;

    const propagator = construct_propagator(inputs, outputs, () => {
        if (!built) {
            console.log("activate compound propagator a")
            activate();
            built = true;
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

export function get_relation(propagator: Propagator) {
    return propagator.relation;
}

export function lift_propagator_a<E>(f: (...args: any[]) => E) {
    return (...cells: Cell<any>[]) => {
        const inputs = get_input_cells(cells);
        const outputs = [get_output_cell(cells)];
        return construct_propagator(new Set(inputs), new Set(outputs), 
            () => {
                outputs.forEach(output => {
                    update_cell(output, f(...inputs.map(c => c.value)));
                })
            }
        );
    }
}

export function lift_propagator_b<E>(f: (next: (update: E) => void, ...args: any[]) => void) {

    return (...args: any[]) => {
       const inputs = get_input_cells(args);
       const output = get_output_cell(args);
       return construct_propagator(new Set(inputs), new Set([output]), () => {
            const next = (update: E) => {
                    update_cell(output, update);
                }

            f(next, ...inputs.map(c => c.value));
        })
    }
}








