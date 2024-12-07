import { reference_store } from "../shared/helper";
import { alert_propagator } from "./scheduler";
import { the_nothing, type Cell, type CellValue, type Propagator, type PropagatorConstructor } from "../type";
import { default_equal, default_merge, default_strongest, default_handle_contradiction } from "./default_propagator";

const get_new_id = reference_store();

export function construct_primitive_cell<E>(value: CellValue<E>): Cell<E>{
    const id = get_new_id();
    return {
        id: id.toString(),
        name: `primitive_${id}`,
        children: [],
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
        disposer(){
            // TODO: 
            this.neighbors.forEach((neighbor: Propagator) => {
                neighbor.disposer();
            });
            this.children.forEach((child: Cell<CellValue<E>>) => {
                child.disposer();
            }); 
            this.children = [];
            this.neighbors = [];
        }
    }
}

export function cell_constructor<E>(
    merge: PropagatorConstructor,
    strongest: PropagatorConstructor,
    handle_contradiction: PropagatorConstructor): 
    (value: CellValue<E>, name: string) => Cell<E> {

    return (value: CellValue<E>, name: string): Cell<E> => {
        const id = get_new_id();
        var content = construct_primitive_cell<E>(value);
        var strongest_value = construct_primitive_cell<E>(the_nothing);
        var new_value = construct_primitive_cell<E>(the_nothing);
        const merge_propagator = merge([new_value], [content]);
        const strongest_propagator = strongest([strongest_value], [content]);
        var children = [content, strongest_value, new_value];
        var neighbors: Propagator[] = [];
        const cell = {
                id: id.toString(),
                name: name,
                children: children,
                get value(): CellValue<E> {
                    return strongest_value.value ? content.value : the_nothing;
                },
                set value(v: CellValue<E>) {
                    new_value.value = v;
                },
                neighbors: neighbors,
                disposer: () => {
                    merge_propagator.disposer();
                    strongest_propagator.disposer();
                    new_value.disposer();
                    strongest_value.disposer();
                    content.disposer(); 
                    handle_contradiction_propagator.disposer();
                    neighbors.forEach((neighbor: Propagator) => {
                        neighbor.disposer();
                    }); 
                    neighbors = [];
                    children = [];
                }   
        }

        const handle_contradiction_propagator = handle_contradiction([cell], [cell]);

        return cell;
    }
}

export const default_cell_constructor = cell_constructor(
    default_merge, 
    default_strongest, 
    default_handle_contradiction
);