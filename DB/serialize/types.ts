// ============================================================================
// TYPE DEFINITIONS
// ============================================================================

export type Reference = {
    type: "reference";
    ref_type: string;
    id: string;
    name: string;
}

interface SchemaCell {
    id: string;
    name: string;
    content: any;
    strongest: any;
    neighbors: Map<string, any>;
}

export interface CellSchema extends SchemaCell {
    type: "cell";
}

// Explicit type export for Vite compatibility
export type { CellSchema };

export interface PropagatorSchema {
    type: "propagator";
    id: string;
    name: string;
    inputs: Reference[];
    outputs: Reference[];
}

export interface ClosureSchema {
    type: "closure";
    env: Reference; // LexicalEnvironment is Cell<Map<string, Cell<any>>>, so encode as cell reference
    name: LainElementSchema;
    inputs: LainElementSchema[];
    outputs: LainElementSchema[];
    body: LainElementSchema[];
}

export interface LainElementSchema {

    type: "lain_element";
    element_type: string;
    value: any;
}

// Explicit type exports for Vite compatibility
export type { PropagatorSchema, ClosureSchema, LainElementSchema };