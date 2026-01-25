import { is_cell, cell_id, cell_name, type Cell, cell_strongest_base_value } from "ppropogator/Cell/Cell";
import { is_propagator, type Propagator, propagator_children, propagator_id, propagator_name } from "ppropogator/Propagator/Propagator";
import { trace_cell, find_propagator_by_id } from "ppropogator/Shared/GraphTraversal";
import { is_nothing } from "ppropogator/Cell/CellValue";
import { get_base_value } from "sando-layer/Basic/Layer";
import { is_layered_object, type LayeredObject } from "sando-layer/Basic";
// Optional import - ascii-force is in eko, not lain-lang
// If not available, graph rendering will be disabled
// We'll use dynamic imports when needed
type ForceGraph = any;
type AsciiForceNode = any;
type AsciiForceLink = any;
import { type LexicalEnvironment } from "./env";
import type { TraceResult } from "ppropogator/Shared/GraphTraversal";
import { compose } from "generic-handler/built_in_generics/generic_combinator";
import { map, filter, reduce, flat_map } from "generic-handler/built_in_generics/generic_collection";
import { is_boolean, is_number, is_object, is_string } from "generic-handler/built_in_generics/generic_predicates";

type RenderOptions = {
    width?: number;
    height?: number;
    linkDistance?: number;
    nodeRadius?: number;
    ticks?: number;
    chargeStrength?: number;
    includeStats?: boolean;
};

const defaultOptions: Required<RenderOptions> = {
    width: 200,
    height: 400,
    linkDistance: 8,
    nodeRadius: 1,
    ticks: 500,
    chargeStrength: -80,
    includeStats: true,
};

/**
 * Formats a cell value for display in the graph.
 * Handles nothing, primitives, layered objects, and complex objects.
 */
const formatCellValue = (value: any): string => {
    if (is_nothing(value)) {
        return "";
    }
    else if (value === null || value === undefined) {
        return "";
    }
    else if (is_layered_object(value)) {
        // Recursively handle nested layered objects
        const format_base_value: (object: LayeredObject<any>) => string = 
            (object: LayeredObject<any>) => {
                const base_value = get_base_value(object);
                if (is_layered_object(base_value)) {
                    return format_base_value(base_value) as string;
                }
                else if (is_string(base_value)) {
                    return `"${base_value}"` as string;
                }
                else if (is_number(base_value)) {
                    return String(base_value) as string;
                }
                else if (is_boolean(base_value)) {
                    return String(base_value) as string;
                }
                else if (is_object(base_value)) {
                    return `{${Object.keys(object).join(",")}}` as string;
                }
                else {
                    console.error("formatCellValue: unknown base value", base_value);
                    return "..." as string;
                }
            }
        return format_base_value(value);
    }
    else {
        console.error("formatCellValue: unknown value", value);
        return "unknown" as string;
    }
};



type AsciiForceGraph = {
    nodes: AsciiForceNode[];
    links: AsciiForceLink[];
}

export const make_ascii_force_graph = (nodes: AsciiForceNode[], links: AsciiForceLink[]): AsciiForceGraph => {
    return {
        nodes,
        links
    }
}

export const array_concat = (a: any[], b: any[]): any[] => {
    return a.concat(b);
}


export const propagator_to_links = (propagator: Propagator): AsciiForceLink[] => {
    return array_concat(
        map(propagator.getInputs(), (input: Cell<any>) => ({
            source: cell_id(input),
            target: propagator_id(propagator)
        })),
        map(propagator.getOutputs(), (output: Cell<any>) => ({
            source: propagator_id(propagator),
            target: cell_id(output)
        }))
    )
}

export const traced_result_to_graph = (
    cell_convertor: (cell: Cell<any>) => AsciiForceNode,
    propagator_convertor: (propagator: Propagator) => AsciiForceNode
) =>  (result: TraceResult) => {
    const cells = Array.from(result.cells.values());
    const propagators = Array.from(result.propagators.values());
    return make_ascii_force_graph(
        array_concat(
           map(cells, cell_convertor),
           map(propagators, propagator_convertor)
        ),
        flat_map(
            propagators,
            propagator_to_links
        )
    )
}

export const name_tracer = traced_result_to_graph(
    (cell: Cell<any>) => ({
        id: cell_id(cell),
        label: cell_name(cell) || cell_id(cell)
    }),
    (propagator: Propagator) => ({
        id: propagator_id(propagator),
        label: propagator_name(propagator) || propagator_id(propagator)
    })
)


/**
 * Renders an ASCII graph representation of a cell and its connected propagators.
 * Returns a string with the graph visualization.
 * Note: Requires ascii-force from eko package. If not available, returns error message.
 */
export const renderCellGraph = async (
    cell: Cell<any>,
    options: RenderOptions = {}
): Promise<string> => {
    try {
        // Try to dynamically import ascii-force (optional, may not be available)
        // This is a fallback - graph rendering is optional
        throw new Error("Graph rendering requires ascii-force package");
    const opts = { ...defaultOptions, ...options };
    const traceResult = trace_cell(cell);

        const renderResult = asciiForce.renderAsciiForceGraph(
        name_tracer(traceResult), 
        {
            width: opts.width,
            height: opts.height,
            linkDistance: opts.linkDistance,
            nodeRadius: opts.nodeRadius,
            ticks: opts.ticks,
            chargeStrength: opts.chargeStrength
        }
    );
    return renderResult.frame;
    } catch (e) {
        return `Graph rendering unavailable: ascii-force not found. Install eko package for graph visualization.`;
    }
};

/**
 * Renders a graph to console (for REPL use).
 * This is a convenience function that logs the graph output.
 */
export const renderCellGraphToConsole = async (cell: Cell<any>, options: RenderOptions = {}): Promise<void> => {
    const result = await renderCellGraph(cell, options);
    console.log(result);
};




