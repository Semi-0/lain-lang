import { reduce } from "generic-handler/built_in_generics/generic_array_operation";
import { cell_id } from "./cell";
import type { Cell, Propagator } from "../type";

export function get_propagator_reference(propagator: Propagator) {
    return reduce(Array.from(propagator.outputs), (acc: string, cell: Cell<any>) => {
        return acc + cell_id(cell);
    }, "");
}