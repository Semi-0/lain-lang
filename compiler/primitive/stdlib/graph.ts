import { trace_upstream_periodically } from "../../tracer/tracer";
import {
    p_graph_card,
    p_graph_connected_prefix,
    p_graph_label_prefix,
    p_graph_name,
    p_graph_nodes,
} from "../../tracer/graph_queries";
import {
    trace_upstream,
    trace_upstream_primitive,
    trace_downstream,
    trace_upstream_periodic,
    trace_downstream_periodic,
} from "../../tracer/generalized_tracer";
import {
    p_graph_kind,
    p_graph_namespace,
    p_graph_namespace_connected,
    p_graph_at_level,
    p_graph_intersect,
    p_graph_union,
    p_graph_collapse_accessors,
    p_graph_annotate_content,
} from "../../tracer/graph_combinators";
import {
    p_graph_query_call_graph,
    p_graph_query_card_network,
    p_graph_query_downstream_of,
    p_graph_rel_exists_query,
    p_graph_rel_edges,
    p_graph_rel_node_ids,
    p_graph_rel_run_query,
    p_graph_rel_nodes_by_kind,
    p_graph_rel_nodes_by_level,
    p_graph_rel_nodes_by_namespace,
    p_graph_query_inspect_content,
    p_graph_query_inspect_values,
    p_graph_query_primitive_direct,
    p_graph_query_reachable,
    p_graph_query_upstream_of,
} from "../../tracer/graph_relations";
import type { SpecialPrimitiveSpec } from "./types";

/**
 * graph:dependents and graph:downstream use periodic trace variants so outputs can sync back
 * to the env without reactive p_tap loops when the gatherer is tied to the env.
 */
export const graph_special_primitive_specs: readonly SpecialPrimitiveSpec[] = [
    { key: "graph:trace-dependents", inputs: 1, outputs: 1, constructor: trace_upstream },
    { key: "graph:trace-downstream", inputs: 1, outputs: 1, constructor: trace_downstream },
    { key: "graph:active-trace", inputs: 1, outputs: 1, constructor: trace_upstream_periodically },
    { key: "graph:dependents", inputs: 1, outputs: 1, constructor: trace_upstream_periodic },
    { key: "graph:prim-dependents", as: "graph:primitive-dependents", inputs: 1, outputs: 1, constructor: trace_upstream_primitive },
    { key: "graph:card", inputs: 2, outputs: 1, constructor: p_graph_card },
    { key: "graph:prefix", as: "graph:label", inputs: 2, outputs: 1, constructor: p_graph_label_prefix },
    { key: "graph:prefix:connected", inputs: 2, outputs: 1, constructor: p_graph_connected_prefix },
    { key: "graph:nodes", inputs: 2, outputs: 1, constructor: p_graph_nodes },
    { key: "graph:name", inputs: 2, outputs: 1, constructor: p_graph_name },
    { key: "graph:downstream", inputs: 1, outputs: 1, constructor: trace_downstream_periodic },
    { key: "graph:kind", inputs: 2, outputs: 1, constructor: p_graph_kind },
    { key: "graph:namespace", inputs: 2, outputs: 1, constructor: p_graph_namespace },
    { key: "graph:namespace-connected", inputs: 2, outputs: 1, constructor: p_graph_namespace_connected },
    { key: "graph:at-level", inputs: 2, outputs: 1, constructor: p_graph_at_level },
    { key: "graph:intersect", inputs: 2, outputs: 1, constructor: p_graph_intersect },
    { key: "graph:union", inputs: 2, outputs: 1, constructor: p_graph_union },
    { key: "graph:collapse-accessors", inputs: 1, outputs: 1, constructor: p_graph_collapse_accessors },
    { key: "graph:annotate-content", inputs: 1, outputs: 1, constructor: p_graph_annotate_content },
    { key: "graph:reachable", inputs: 3, outputs: 1, constructor: p_graph_query_reachable },
    { key: "graph:upstream-of", inputs: 2, outputs: 1, constructor: p_graph_query_upstream_of },
    { key: "graph:downstream-of", inputs: 2, outputs: 1, constructor: p_graph_query_downstream_of },
    { key: "graph:query:card-network", inputs: 2, outputs: 1, constructor: p_graph_query_card_network },
    { key: "graph:query:primitive-direct", inputs: 1, outputs: 1, constructor: p_graph_query_primitive_direct },
    { key: "graph:query:call-graph", inputs: 1, outputs: 1, constructor: p_graph_query_call_graph },
    { key: "graph:query:inspect-values", inputs: 1, outputs: 1, constructor: p_graph_query_inspect_values },
    { key: "graph:query:inspect-content", inputs: 1, outputs: 1, constructor: p_graph_query_inspect_content },
    { key: "graph:rel:node-ids", inputs: 1, outputs: 1, constructor: p_graph_rel_node_ids },
    { key: "graph:rel:edges", inputs: 1, outputs: 1, constructor: p_graph_rel_edges },
    { key: "graph:rel:nodes-by-kind", inputs: 2, outputs: 1, constructor: p_graph_rel_nodes_by_kind },
    { key: "graph:rel:nodes-by-namespace", inputs: 2, outputs: 1, constructor: p_graph_rel_nodes_by_namespace },
    { key: "graph:rel:nodes-by-level", inputs: 2, outputs: 1, constructor: p_graph_rel_nodes_by_level },
    { key: "graph:rel:run-query", inputs: 2, outputs: 1, constructor: p_graph_rel_run_query },
    { key: "graph:rel:exists-query", inputs: 2, outputs: 1, constructor: p_graph_rel_exists_query },
];
