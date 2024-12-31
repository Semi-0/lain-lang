import { reference_store } from "../shared/helper";
import { alert_propagator } from "./scheduler";
import { is_cell, the_nothing, type Cell, type CellValue, type Propagator, type PropagatorFunction, type Relation } from "../type";
import { deep_equal } from "sando-layer/Equality";
import { construct_relation, get_parent } from "./relation";
import { add_primitive, get_global_parent, global_env } from "./global";
import { v4 as uuidv4 } from 'uuid';
import { get_id } from "./relation";
import { define_generic_procedure_handler } from "generic-handler/GenericProcedure";
import { match_args } from "generic-handler/Predicates";
import { to_string } from "generic-handler/built_in_generics/generic_conversation";

export function cell_constructor<E>(get: () => E, set: (update: E, alert_propagators: () => void) => void): Cell<E> {
        var neighbors: Set<Propagator> = new Set();
        var relation: Relation = construct_relation(uuidv4(), get_global_parent());
  
        const cell = {
                relation: relation,
                get value(): CellValue<E> {
                    return get();
                },
                set value(v: CellValue<E>) {
                    set(v as E, () => { 
                        neighbors.forEach(neighbor => {
                            alert_propagator(neighbor);
                        });
                    });
                },
                add_neighbor: (propagator: Propagator) => {
                    neighbors.add(propagator);
                    alert_propagator(propagator);
                },
                remove_neighbor: (propagator: Propagator) => {
                    // console.log("remove_neighbor", propagator)
                    neighbors.delete(propagator);
                },
                get_neighbors: () => {
                    return neighbors;
                },
                equals: (x: Cell<E>, y: Cell<E>) => {
                    return get_id(x.relation) === get_id(y.relation);
                }
        }

        add_primitive(relation.get_id(), cell);

        return cell;
    }


define_generic_procedure_handler(to_string, match_args(is_cell), (cell: Cell<any>) => {
    return 'Cell(' + cell.relation.get_id() + ')' + ' with ' + cell.get_neighbors().size + ' neighbors' ;
})

export function primitive_cell<E>(): Cell<E>{
    var value: CellValue<E> = the_nothing

    return cell_constructor<E>(() => value as E, 
                              (update: CellValue<E>, alert_propagators: () => void) => {
                                if (deep_equal(value, update)) {
                                    return;
                                }
                                else{
                                    value = update;
                                    alert_propagators();
                                }
                              }
    )
}

export function constant_cell<E>(value: E): Cell<E>{
    const cell = primitive_cell<E>();
    update_cell(cell, value);
    return cell;
}

export function update_cell(cell: Cell<any>, value: any){
    console.log("update_cell", cell, value)
    cell.value = value
}

export function add_neighbor(cell: Cell<any>, propagator: Propagator){
   cell.add_neighbor(propagator);
} 

export function remove_neighbor(cell: Cell<any>, propagator: Propagator){
    cell.remove_neighbor(propagator);
}  

export function get_neighbors(cell: Cell<any>){
    return cell.get_neighbors();
}

export function get_propagators(cell: Cell<any>){
    return cell.get_neighbors();
}

export function get_value(cell: Cell<any>){
    return cell.value;
}

export function get_relation(cell: Cell<any>){
    return cell.relation;
}

export function trace_cell_chain(cell: Cell<any>, f: (cell: Cell<any>) => void){
    //TODO: handle cyclic references
    f(cell);
    cell.get_neighbors().forEach(neighbor => {
        neighbor.outputs.forEach(output => {
            trace_cell_chain(output, f);
        });
    });
}