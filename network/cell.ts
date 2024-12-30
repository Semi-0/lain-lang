import { reference_store } from "../shared/helper";
import { alert_propagator } from "./scheduler";
import { the_nothing, type Cell, type CellValue, type Propagator, type PropagatorFunction } from "../type";
import { deep_equal } from "sando-layer/Equality";

const get_new_id = reference_store();


export function cell_constructor<E>(get: () => E, set: (update: E, alert_propagators: () => void) => void): Cell<E> {
        const id = get_new_id();

        var neighbors: Set<Propagator> = new Set();
        const cell = {
                id: id.toString(),
         
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
                    neighbors.delete(propagator);
                },
                get_neighbors: () => {
                    return neighbors;
                },
                children: [],
                dispose: () => {
                    neighbors.clear();
                }
        }

        return cell;
    }

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
    cell.value = value
}

export function add_propagator(cell: Cell<any>, propagator: Propagator){
   cell.add_neighbor(propagator);
} 

export function remove_propagator(cell: Cell<any>, propagator: Propagator){
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


export function trace_cell_chain(cell: Cell<any>, f: (cell: Cell<any>) => void){
    f(cell);
    cell.get_neighbors().forEach(neighbor => {
        neighbor.outputs.forEach(output => {
            trace_cell_chain(output, f);
        });
    });
}