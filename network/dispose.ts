import { construct_simple_generic_procedure, define_generic_procedure_handler } from "generic-handler/GenericProcedure";
import { is_cell, is_propagator, type PrimitiveObject, type Propagator } from "../type";
import { match_args } from "generic-handler/Predicates";
import { pipe } from "fp-ts/lib/function";
import { get_relation } from "./propagator";
import { get_children, get_id, get_parent, relation_map, remove_child } from "./relation";
import * as str from "fp-ts/string";
import { get_primitive, remove_primitive } from "./global";
import type { Cell, Relation } from "../type";
import { map } from "fp-ts/Set";
import * as O from "fp-ts/Option";
import { remove_neighbor } from "./cell";
import { is_relation } from "../type";
import { inspect } from "bun";
// TODO: UNIT TEST

const disposedSet = new Set<string>();

// Add a wrapper function to handle clearing the disposedSet
export const dispose = construct_simple_generic_procedure("dispose", 1, (primitive: PrimitiveObject) => {
    try {
        _dispose(primitive);
    } finally {
        // Clear the set after each top-level disposal
        disposedSet.clear();
    }
});

// Rename the internal dispose implementation
const _dispose = construct_simple_generic_procedure("_dispose", 1, (primitive: PrimitiveObject) => {

    throw new Error("dispose is not implemented:" + inspect(primitive) );
});

// Update the handler to use _dispose instead of dispose
define_generic_procedure_handler(_dispose, match_args(is_propagator), (propagator: Propagator) => {
    if (!propagator || disposedSet.has(get_id(get_relation(propagator)))) {
        return;
    }
    
    disposedSet.add(get_id(get_relation(propagator)));
    
    // Update recursive calls to use _dispose
    const relation = get_relation(propagator);
    if (relation) {
        const id = get_id(relation);
        _dispose(relation);
    }

    // safely remove self from neighbors
    if (propagator.inputs) {
        pipe(
            propagator.inputs,
            (inputs: Set<Cell<any>>) => {
                inputs.forEach(input => {
                    if (input) remove_neighbor(input, propagator);
                })
            }
        )
    }

    if (propagator.outputs) {
        pipe(
            propagator.outputs,
            (outputs: Set<Cell<any>>) => {
                outputs.forEach(output => {
                    if (output) remove_neighbor(output, propagator);
                })
            }
        )
    }
    remove_primitive(get_id(get_relation(propagator)));

    propagator.outputs?.clear();
    propagator.inputs?.clear();
    propagator.activate = () => {};


})

define_generic_procedure_handler(_dispose, match_args(is_relation), (relation: Relation) => {
    // remove self from parent
    pipe(
        get_parent(relation),
        O.map(parent => {
            parent.remove_child(relation);
        }),
        O.getOrElse(() => {})
    ) 

    // dispose all children
    pipe(
        get_children(relation),
        map(str.Eq)(get_id),
        (ids: Set<string>) => {
            ids.forEach(id => {
                const child = get_primitive(id);
                pipe(
                    child,
                    O.map(child => {
                        // dispose child would remove child from parent
                        dispose(child);
                    }),
                    O.getOrElse(() => {})
                )
            })
        }
   )
   remove_primitive(get_id(relation));
   relation.get_children().clear();
})

define_generic_procedure_handler(dispose, match_args(is_cell), (cell: Cell<any>) => {
    dispose(cell.relation);

    // if you dispose a cell, all its propagator will be dispose otherwise reference
    // inside  the activate function will not be empty
    pipe(
        cell.get_neighbors(),
        (neighbors: Set<Propagator>) => {
            neighbors.forEach(neighbor => {
               dispose(neighbor);
            })
        }
    )
    remove_primitive(get_id(cell.relation));
})