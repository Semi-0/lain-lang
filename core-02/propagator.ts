import { add_inbound_edge, add_outbound_edge, create_node, node_id } from "./nodes";
import { pipe } from "effect";
import { node_outbounds } from "./nodes";
import { GraphNode } from "./nodes";
import { curried_map } from "ppropogator/Helper/Helper";
import { the_nothing_type } from "ppropogator/Cell/CellValue";

interface PropagatorConstruct{
    name: string,
    content: any,
}

const propagator_store = new Map<string, PropagatorConstruct>();

const store_set_propagator = (node: GraphNode, propagator: PropagatorConstruct) => {
    propagator_store.set(node_id(node), propagator);
}

const get_propagator = (node: GraphNode): PropagatorConstruct | the_nothing_type => {
    const propagator = propagator_store.get(node_id(node));
    if (propagator !== undefined) {
        return propagator;
    }
    else {
        throw new Error("Propagator not found: " + node_id(node));
    }
}

const create_mono_directional_propagator =  (name: string, f: (...args: any[]) => any, inputs: GraphNode[], outputs: GraphNode[]): GraphNode => {
    const node = create_node(name);
    const propagator = {
        name,
        content: f
    }

    inputs.forEach(input => {
        add_inbound_edge(node, input);
    })
    outputs.forEach(output => {
        add_outbound_edge(node, output);
    })

    store_set_propagator(node, propagator);
    return node
}


const compound_propagator = (name: string, internal_network: GraphNode[], inputs: GraphNode[], outputs: GraphNode[]) => {
    const node = create_node(name);
    const propagator = {
        name,
        content: internal_network
    }

    inputs.forEach(input => {
        add_inbound_edge(node, input);
    })
    outputs.forEach(output => {
        add_outbound_edge(node, output);
    })

    store_set_propagator(node, propagator);
    return node
}

const get_outbounds_propagators = (node: GraphNode): PropagatorConstruct[] => {
    return  pipe(
        node, 
        node_outbounds,
        curried_map(get_propagator)
    )
}

export {
    create_mono_directional_propagator,
    compound_propagator,
    get_propagator,
    get_outbounds_propagators,
}
export type { PropagatorConstruct }
