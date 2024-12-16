import { reference_store } from "../shared/helper";
import { alert_propagator } from "./scheduler";
import { the_nothing, type Cell, type CellValue, type Propagator, type PropagatorConstructor } from "../type";

const get_new_id = reference_store();


export function cell_constructor<E>(get: () => E, set: (update: E) => void): 
    (name: string) => Cell<E> {

    return (name: string): Cell<E> => {
        const id = get_new_id();

        var neighbors: Propagator[] = [];
        const cell = {
                id: id.toString(),
                name: name,
         
                get value(): CellValue<E> {
                    return get();
                },
                set value(v: CellValue<E>) {
                    set(v as E);
                    this.neighbors.forEach(neighbor => {
                        alert_propagator(neighbor);
                    });
                },
                neighbors: neighbors,
        }

        return cell;
    }
}

export function construct_primitive_cell<E>(): (name: string) => Cell<E>{
    var value: CellValue<E> = the_nothing
    return (name: string) => {
        return cell_constructor<E>(() => value as E, 
                              (update: CellValue<E>) => value = update)(name);
    }
}

export function construct_primitive_cell_with_value<E>(value: E): (name: string) => Cell<E>{
    return (name: string) => {
        const cell = construct_primitive_cell<E>()(name);
        cell.value = value;
        return cell;
    }
}

export function update_cell(v: any, cell: Cell<any>){
    cell.value = v
}