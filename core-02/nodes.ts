import { v4 as uuidv4 } from 'uuid';
import { GraphEdge } from '../src/grpc/card';
import { the_nothing } from 'ppropogator';
import { is_unusable_value, the_nothing_type } from 'ppropogator/Cell/CellValue';

export interface GraphNode{
    id: string
    inbounds: GraphNode[],
    outbounds: GraphNode[],
}


export function create_node(id: string): GraphNode {
    const node = {
        id,
        inbounds: [],
        outbounds: [],
    }

    return node;
}

export const connect_nodes_inbound_outbound = (nodeA: GraphNode, nodeB: GraphNode) => {
    nodeA.outbounds.push(nodeB);
    nodeB.inbounds.push(nodeA);
}

export const connect_nodes_both_directions = (nodeA: GraphNode, nodeB: GraphNode) => {
    connect_nodes_inbound_outbound(nodeA, nodeB);
    connect_nodes_inbound_outbound(nodeB, nodeA);
}

export const disconnect_nodes = (nodeA: GraphNode, nodeB: GraphNode) => {
    nodeA.outbounds = nodeA.outbounds.filter(n => n !== nodeB);
    nodeA.inbounds = nodeA.inbounds.filter(n => n !== nodeB);
    nodeB.inbounds = nodeB.inbounds.filter(n => n !== nodeA);
    nodeB.outbounds = nodeB.outbounds.filter(n => n !== nodeA);
}


export const f_map = (f: (v: any) => any) => (v: any)=> {
    if (is_unusable_value(v)) {
        return v
    }
    else {
        return f(v)
    }
}


export function add_inbound_edge(nodeA: GraphNode, nodeB: GraphNode) {
    nodeA.inbounds.push(nodeB);
    nodeB.outbounds.push(nodeA);
    
}

export function add_outbound_edge(nodeA: GraphNode, nodeB: GraphNode) {
    nodeA.outbounds.push(nodeB);
    nodeB.inbounds.push(nodeA);
}

export function remove_inbound_edge(node: GraphNode, inbound: GraphNode) {
    node.inbounds = node.inbounds.filter(n => n !== inbound);
}

export function remove_outbound_edge(node: GraphNode, outbound: GraphNode) {
    node.outbounds = node.outbounds.filter(n => n !== outbound);
}

export const node_outbounds = (node: GraphNode) => (node.outbounds)
export const node_inbounds = (node: GraphNode) => (node.inbounds)
export const node_id = (node: GraphNode) => (node.id)