import type { Cell, Propagator } from "../type";
import { reference_store } from "../shared/helper";

const get_new_id = reference_store();

export function construct_propagator(name: string, 
                                    cells: Cell<any>[], 
                                    activate: () => void): Propagator{
    return {
        id: get_new_id().toString(),
        name: name,
        cells: cells,
        activate: activate,
        children: [],
        neighbors: [],
        disposer() {
            this.children.forEach((child: Propagator) => {
                child.disposer();
            });
            this.children = [];
            this.neighbors.forEach((cell: Cell<any>) => {
                cell.disposer();
            });
            this.neighbors = [];
        }
    }
}

