import { register_predicate } from "generic-handler/Predicates";
import type { CellValue } from "../type";
import { the_contradiction, the_nothing } from "../type";
import { is_layered_object as is_layered } from "sando-layer/Basic/LayeredObject";


export const is_nothing = register_predicate("is_nothing", (value: CellValue<any>) => {
    return value === the_nothing;
});

export const is_contradiction = register_predicate("is_contradiction", (value: CellValue<any>) => {
    return value === the_contradiction;
});

export const is_cell_value = register_predicate("is_cell_value", (value: any) => {
    return is_nothing(value) || is_contradiction(value);
});

export const is_cell = register_predicate("is_cell", (value: any) => {
    return typeof value === "object" && value !== null && "id" in value && "name" in value && "children" in value && "value" in value && "neighbors" in value && "disposer" in value;
});

export const is_propagator = register_predicate("is_propagator", (value: any) => {
    return typeof value === "object" && value !== null && "id" in value && "name" in value && "input" in value && "output" in value && "activate" in value && "children" in value && "neighbors" in value && "disposer" in value;
});

// make sure registered in local generic store
export const is_layered_object = register_predicate("is_layered_object", is_layered);

export const is_continuation = register_predicate("is_continuation", (value: any) => {
    return typeof value === "function";
});