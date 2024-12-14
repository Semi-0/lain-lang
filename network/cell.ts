import { reference_store } from "../shared/helper";
import { alert_propagator } from "./scheduler";
import { the_nothing, type Cell, type CellValue, type Propagator, type PropagatorConstructor } from "../type";

const get_new_id = reference_store();

export function construct_primitive_cell<E>(value: CellValue<E>): Cell<E>{
    const id = get_new_id();
    return {
        id: id.toString(),
        name: `primitive_${id}`,
        get value(): CellValue<E> {
            return value;
        },
        set value(v: CellValue<E>) {
            value = v;
            this.neighbors.forEach(neighbor => {
                alert_propagator(neighbor);
            });
        },
        neighbors: [],
    }
}

export function cell_constructor<E>(get_subnet: (state: Cell<E>) => E, set_subnet: (state: Cell<E>) => (update: E) => void): 
    (value: CellValue<E>, name: string) => Cell<E> {

    return (value: CellValue<E>, name: string): Cell<E> => {
        const id = get_new_id();

        var neighbors: Propagator[] = [];
        const cell = {
                id: id.toString(),
                name: name,
         
                get value(): CellValue<E> {
                    return get_subnet(cell);
                },
                set value(v: CellValue<E>) {
                    set_subnet(cell)(v as E);
                },
                neighbors: neighbors,
        }

        return cell;
    }
}

