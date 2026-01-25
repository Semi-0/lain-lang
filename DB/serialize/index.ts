// ============================================================================
// SERIALIZATION MODULE - MAIN ENTRY POINT
// ============================================================================

// Core procedures
export { gun_db_schema_encode } from "./encode";
export { gun_db_schema_decode } from "./decode";

// Types
export type { Reference, CellSchema, PropagatorSchema } from "./types";
export type { LainElementSchema } from "./schemas/lain_element";
export type { ClosureSchema } from "./schemas/closure_schema";

// Reference functions
export { make_reference, cell_reference, propagator_reference } from "./references";

// Schema encoding functions
export { cell_schema_encode } from "./schemas/cell";
export { map_schema } from "./schemas/map";
export { set_schema } from "./schemas/set";
export { layered_object_schema } from "./schemas/layered_object";
export { propagator_schema } from "./schemas/propagator";
export { interested_neighbor_schema } from "./schemas/neighbor";

// Predicate functions
export {
    is_cell_schema,
    is_map_schema,
    is_set_schema,
    is_layered_object_schema,
    is_schema,
    is_lain_element_schema,
    is_closure_schema,
} from "./predicates";
