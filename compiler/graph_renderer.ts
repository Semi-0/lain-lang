import { is_cell, cell_id, cell_name, type Cell, cell_strongest_base_value } from "ppropogator/Cell/Cell";
import { is_propagator, type Propagator, propagator_children, propagator_id, propagator_name } from "ppropogator/Propagator/Propagator";
import { find_propagator_by_id } from "ppropogator/Shared/GraphTraversal";
import { get_downstream, get_id } from "ppropogator/Shared/Spider";
import { is_nothing } from "ppropogator/Cell/CellValue";
import { get_base_value } from "sando-layer/Basic/Layer";
import { is_layered_object, type LayeredObject } from "sando-layer/Basic";
import { renderAsciiForceGraph } from "./ascii-force";
import type { ForceGraph, AsciiForceNode, AsciiForceLink } from "./ascii-force/types";
import { type LexicalEnvironment } from "./env";
import type { TraceResult } from "ppropogator/Shared/GraphTraversal";
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

/**
 * Custom trace_cell implementation that avoids generic collection functions (flat_map)
 * which cause stack overflow on large graphs. Uses native iteration instead.
 */
const trace_cell_safe = (root: Cell<any>): TraceResult => {
    const cells = new Map<string, Cell<any>>();
    const propagators = new Map<string, Propagator>();
    const visited = new Set<string>();
    const queue: any[] = [root];
    
    while (queue.length > 0) {
        const node = queue.shift()!;
        const id = get_id(node);
        
        if (visited.has(id)) {
            continue;
        }
        visited.add(id);
        
        if (is_cell(node)) {
            cells.set(id, node);
        } else if (is_propagator(node)) {
            propagators.set(id, node);
        }
        
        // Get downstream nodes without using generic flat_map
        const downstream = get_downstream(node);
        for (const child of downstream) {
            const childId = get_id(child);
            if (!visited.has(childId)) {
                queue.push(child);
            }
        }
    }
    
    return { cells, propagators };
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
    // Manually build arrays to avoid ANY generic collection method calls
    const result: AsciiForceLink[] = [];
    
    // Use for...of to avoid calling collection methods
    const inputs = propagator.getInputs();
    for (const input of inputs) {
        result.push({
            source: cell_id(input),
            target: propagator_id(propagator)
        });
    }
    
    const outputs = propagator.getOutputs();
    for (const output of outputs) {
        result.push({
            source: propagator_id(propagator),
            target: cell_id(output)
        });
    }
    
    return result;
}

export const traced_result_to_graph = (
    cell_convertor: (cell: Cell<any>) => AsciiForceNode,
    propagator_convertor: (propagator: Propagator) => AsciiForceNode
) =>  (result: TraceResult) => {
    // Manually iterate to avoid ANY collection method calls that might trigger generic handlers
    const nodes: AsciiForceNode[] = [];
    const node_ids = new Set<string>();
    const propagators_list: Propagator[] = [];
    
    // Convert cells to nodes
    for (const cell of result.cells.values()) {
        const node = cell_convertor(cell);
        nodes.push(node);
        node_ids.add(node.id);
    }
    
    // Convert propagators to nodes and collect them for link generation
    for (const propagator of result.propagators.values()) {
        const node = propagator_convertor(propagator);
        nodes.push(node);
        node_ids.add(node.id);
        propagators_list.push(propagator);
    }
    
    // Generate and filter links
    const valid_links: AsciiForceLink[] = [];
    for (let i = 0; i < propagators_list.length; i++) {
        const propagator = propagators_list[i]!;
        const links = propagator_to_links(propagator);
        for (const link of links) {
            const source_id = typeof link.source === "string" ? link.source : 
                             typeof link.source === "object" && link.source !== null ? link.source.id : 
                             String(link.source);
            const target_id = typeof link.target === "string" ? link.target : 
                             typeof link.target === "object" && link.target !== null ? link.target.id : 
                             String(link.target);
            if (node_ids.has(source_id) && node_ids.has(target_id)) {
                valid_links.push(link);
            }
        }
    }
    
    return make_ascii_force_graph(nodes, valid_links);
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
        const opts = { ...defaultOptions, ...options };
        const traceResult = trace_cell_safe(cell);
        const renderResult = renderAsciiForceGraph(
            name_tracer(traceResult), 
            {
                width: opts.width,
                height: opts.height,
                linkDistance: opts.linkDistance,
                nodeRadius: opts.nodeRadius,
                ticks: opts.ticks,
                chargeStrength: opts.chargeStrength,
                padding: 6 // Default padding from ascii-force
            }
        );
        return renderResult.frame;
    } catch (e) {
        return `Graph rendering unavailable: ${e instanceof Error ? e.message : String(e)}`;
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




