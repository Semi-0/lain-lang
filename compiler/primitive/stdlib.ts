import { 
    type Cell, p_add, p_subtract, p_multiply, p_divide, 
    p_greater_than, p_less_than, p_equal, p_not, cell_strongest, construct_propagator,
} from "ppropogator";
import { p_greater_than_or_equal, p_less_than_or_equal, bi_sync, p_sync } from "ppropogator/Propagator/BuiltInProps";
import { socket_IO_client_cell } from "ppropogator/Cell/RemoteCell/SocketClientCell";
import { socket_IO_server_cell } from "ppropogator/Cell/RemoteCell/SocketServerCell";
import { forward } from "ppropogator/Propagator/HelperProps";
import { any_unusable_values } from "ppropogator/Cell/CellValue";
import { construct_env_with_inital_value } from "../env";
import { make_primitive, make_two_arity_primitive } from "./base";
import { trace_upstream_periodically, trace_upstream_reactively } from "../tracer/tracer";
import { p_graph_card, p_graph_connected_prefix, p_graph_label_prefix, p_graph_name, p_graph_nodes } from "../tracer/graph_queries";
import { trace_upstream, trace_upstream_primitive, trace_downstream, trace_upstream_periodic, trace_downstream_periodic } from "../tracer/generalized_tracer";
import { p_graph_kind, p_graph_namespace, p_graph_at_level, p_graph_intersect, p_graph_union, p_graph_collapse_accessors, p_graph_annotate_content } from "../tracer/graph_combinators";
import {
    p_graph_query_call_graph,
    p_graph_query_card_network,
    p_graph_query_downstream_of,
    p_graph_query_inspect_content,
    p_graph_query_inspect_values,
    p_graph_query_primitive_direct,
    p_graph_query_reachable,
    p_graph_query_upstream_of,
} from "../tracer/graph_relations";

export const two_arity_prims: [string, any][] = [
    ["+", p_add],
    ["-", p_subtract],
    ["*", p_multiply],
    ["/", p_divide],
    [">", p_greater_than],
    ["<", p_less_than],
    [">=", p_greater_than_or_equal],
    ["<=", p_less_than_or_equal],
    ["==", p_equal],
]

export const p_socket_client = (name: Cell<string>, host: Cell<string>, port: Cell<number>, input: Cell<any>, output: Cell<any>) => {
    let created = false;
    return construct_propagator(
        [name, host, port, input],
        [output],
        () => {
            if (created) return;
            const n = cell_strongest(name);
            const h = cell_strongest(host);
            const p = cell_strongest(port);
            
            if (!any_unusable_values([n, h, p])) {
                created = true;
                // socket_IO_client_cell returns a promise
                // @ts-ignore
                socket_IO_client_cell(n, h, p).then(sc => {
                    forward([input], [sc]);
                    forward([sc], [output]);
                });
            }
        },
        "p_socket_client"
    );
}

export const p_socket_server = (name: Cell<string>, port: Cell<number>, input: Cell<any>, output: Cell<any>) => {
    let created = false;
    return construct_propagator(
        [name, port, input],
        [output],
        () => {
            if (created) return;
            const n = cell_strongest(name);
            const p = cell_strongest(port);
            
            if (!any_unusable_values([n, p])) {
                created = true;
                // socket_IO_server_cell returns a promise
                // @ts-ignore
                socket_IO_server_cell(n, p).then(sc => {
                    forward([input], [sc]);
                    forward([sc], [output]);
                });
            }
        },
        "p_socket_server"
    );
}

/**
 * Returns an array of all primitive operator names.
 * This includes two-arity primitives and special primitives.
 * Note: "parent" is a special key used by the environment system, not a primitive operator.
 */
export const get_primitive_keys = (): string[] => {
    const twoArityNames = two_arity_prims.map(([name]) => name);
    const specialPrimitives = ["bi_sync", "socket-client", "socket-server"];
    return [...twoArityNames, ...specialPrimitives];
}

export const primitive_env = (id: string = "root") => {
    const primitives: [string, Cell<any>][] = [
        ...two_arity_prims.map(
            ([name, constructor]): [string, Cell<any>] =>
                // @ts-ignore
                [name, make_two_arity_primitive(name, constructor)]
        ),
        ["<->", make_primitive("bi_sync", 0, 2, bi_sync)],
        ["->", make_primitive("->", 1, 1, p_sync)],
        // @ts-ignore
        ["graph:trace", make_primitive("graph:trace", 1, 1, trace_upstream_reactively)],
        // @ts-ignore
        ["graph:active-trace", make_primitive("graph:active-trace", 1, 1, trace_upstream_periodically)],
        // graph:dependents and graph:downstream use the periodic (interval-based) trace variants.
        // The reactive trace installs p_tap on every visited cell; when the gatherer is connected
        // to the env via selective_sync, any write to the gatherer triggers a re-traversal →
        // dead loop. The periodic variants rebuild on setInterval (default 400ms) without p_tap,
        // so combinator outputs can write back to the env freely. First rebuild is synchronous.
        ["graph:dependents", make_primitive("graph:dependents", 1, 1, trace_upstream_periodic)],
        ["graph:prim-dependents", make_primitive("graph:primitive-dependents", 1, 1, trace_upstream_primitive)],
        ["graph:card", make_primitive("graph:card", 2, 1, p_graph_card)],
        ["graph:prefix", make_primitive("graph:label", 2, 1, p_graph_label_prefix)],
        // CELL|CARD
        ["graph:prefix:connected", make_primitive("graph:prefix:connected", 2, 1, p_graph_connected_prefix)],
        ["graph:nodes", make_primitive("graph:nodes", 2, 1, p_graph_nodes)],
        ["graph:name", make_primitive("graph:name", 2, 1, p_graph_name)],
        ["graph:downstream",  make_primitive("graph:downstream",  1, 1, trace_downstream_periodic)],
        ["graph:kind",        make_primitive("graph:kind",        2, 1, p_graph_kind)],
        ["graph:namespace",   make_primitive("graph:namespace",   2, 1, p_graph_namespace)],
        ["graph:at-level",    make_primitive("graph:at-level",    2, 1, p_graph_at_level)],
        ["graph:intersect",         make_primitive("graph:intersect",         2, 1, p_graph_intersect)],
        ["graph:union",             make_primitive("graph:union",             2, 1, p_graph_union)],
        ["graph:collapse-accessors",make_primitive("graph:collapse-accessors",1, 1, p_graph_collapse_accessors)],
        ["graph:annotate-content",  make_primitive("graph:annotate-content",  1, 1, p_graph_annotate_content)],
        ["graph:reachable",         make_primitive("graph:reachable",         3, 1, p_graph_query_reachable)],
        ["graph:upstream-of",       make_primitive("graph:upstream-of",       2, 1, p_graph_query_upstream_of)],
        ["graph:downstream-of",     make_primitive("graph:downstream-of",     2, 1, p_graph_query_downstream_of)],
        ["graph:query:card-network",make_primitive("graph:query:card-network",2, 1, p_graph_query_card_network)],
        ["graph:query:primitive-direct", make_primitive("graph:query:primitive-direct", 1, 1, p_graph_query_primitive_direct)],
        ["graph:query:call-graph",  make_primitive("graph:query:call-graph",  1, 1, p_graph_query_call_graph)],
        ["graph:query:inspect-values", make_primitive("graph:query:inspect-values", 1, 1, p_graph_query_inspect_values)],
        ["graph:query:inspect-content", make_primitive("graph:query:inspect-content", 1, 1, p_graph_query_inspect_content)],
        ["socket:client", make_primitive("socket:client", 5, 0, p_socket_client)],
        ["socket:server", make_primitive("socket:server", 4, 0, p_socket_server)],
    ];
    return construct_env_with_inital_value(primitives, id);
}

