// ============================================================================
// PREDICATE FUNCTIONS
// ============================================================================

import { register_predicate } from "generic-handler/Predicates";

export const is_cell_schema = register_predicate(
    "is_cell_schema",
    (x: any) => x instanceof Object && x !== null && x.type === "cell"
);

export const is_map_schema = register_predicate(
    "is_map_schema",
    (x: any) => x instanceof Object && x !== null && x.type === "map"
);

export const is_set_schema = register_predicate(
    "is_set_schema",
    (x: any) => x instanceof Object && x !== null && x.type === "set"
);

export const is_layered_object_schema = register_predicate(
    "is_layered_object_schema",
    (x: any) => x instanceof Object && x !== null && x.type === "layered_object"
);

export const is_schema = register_predicate(
    "is_schema",
    (x: any) => x instanceof Object && x !== null && x.type !== undefined
);

export const is_lain_element_schema = register_predicate(
    "is_lain_element_schema",
    (x: any) => x instanceof Object && x !== null && x.type === "lain_element"
);

export const is_closure_schema = register_predicate(
    "is_closure_schema",
    (x: any) => x instanceof Object && x !== null && x.type === "closure"
);
