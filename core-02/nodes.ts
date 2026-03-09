import { v4 as uuidv4 } from 'uuid';
import { GraphEdge } from '../src/grpc/card';
import { the_nothing } from 'ppropogator';
import { is_unusable_value, the_nothing_type } from 'ppropogator/Cell/CellValue';

export interface GraphNode{
    inbounds: GraphNode[],
    outbounds: GraphNode[],
}

const node_store = new Map<string, GraphNode>();

const set_node = (id: string, node: GraphNode) => {
    node_store.set(id, node);
}

const get_node = (id: string) => {
   return node_store.get(id);
}


export function create_node(id: string): GraphNode {
    const node = {
        inbounds: [],
        outbounds: [],
    }

    set_node(id, node);

    return node;
}

export const connect_nodes_inbound_outbound = (nodeA: string, nodeB: string) => {
    const nodeA_node = get_node(nodeA);
    const nodeB_node = get_node(nodeB);
    if (nodeA_node && nodeB_node) {
        nodeA_node.outbounds.push(nodeB_node);
        nodeB_node.inbounds.push(nodeA_node);
    }
    else {
        throw new Error(`Node ${nodeA} or ${nodeB} not found`);
    }
}

export const connect_nodes_both_directions = (nodeA: string, nodeB: string) => {
    connect_nodes_inbound_outbound(nodeA, nodeB);
    connect_nodes_inbound_outbound(nodeB, nodeA);
}

export const disconnect_nodes = (nodeA: string, nodeB: string) => {
    const nodeA_node = get_node(nodeA);
    const nodeB_node = get_node(nodeB);
    if (nodeA_node && nodeB_node) {
        nodeA_node.outbounds = nodeA_node.outbounds.filter(n => n !== nodeB_node);
        nodeA_node.inbounds = nodeA_node.inbounds.filter(n => n !== nodeB_node);
        nodeB_node.inbounds = nodeB_node.inbounds.filter(n => n !== nodeA_node);
        nodeB_node.outbounds = nodeB_node.outbounds.filter(n => n !== nodeA_node);
    }
    else {
        throw new Error(`Node ${nodeA} or ${nodeB} not found`);
    }
}




export const node_outbounds = (id: string) => (get_node(id)?.outbounds ?? [])
export const node_inbounds = (id: string) => (get_node(id)?.inbounds ?? [])