import { beforeEach, describe, expect, test } from "bun:test"
import { DirectedGraph } from "graphology"
import { construct_cell, cell_strongest_base_value, set_global_state, PublicStateCommand, set_merge } from "ppropogator"
import { cell_id, update_cell } from "ppropogator/Cell/Cell"
import { execute_all_tasks_sequential } from "ppropogator/Shared/Scheduler/Scheduler"
import { internal_clear_source_cells, source_constant_cell } from "ppropogator/DataTypes/PremisesSource"
import { merge_temporary_value_set } from "ppropogator/DataTypes/TemporaryValueSet"
import { is_graphology_graph } from "../../src/grpc/codec/session_encode"
import { update_specialized_reactive_value } from "../../src/grpc/better_runtime"
import { trace_upstream } from "./generalized_tracer"
import {
  edge_fact,
  goal_and,
  graph_query_call_graph,
  graph_query_card_network,
  graph_query_inspect_content,
  graph_query_inspect_values,
  graph_query_primitive_direct,
  graph_query_reachable,
  graph_rel_exists_query,
  graph_rel_run_query,
  kind,
  logic_var,
  p_graph_query_card_network,
  p_graph_query_inspect_content,
  p_graph_query_inspect_values,
  query_node_ids,
  run_goal,
  downstream_of,
  query_nodes_by_kind,
} from "./graph_relations"
import { primitive_env } from "../closure"
import { raw_compile } from "../compiler_entry"
import { init_system } from "../incremental_compiler"
import { add_card, build_card, clear_card_metadata, guarantee_get_card_metadata, internal_cell_this, update_card } from "../../src/grpc/card"

type InspectionRow = {
  readonly id: string
  readonly label?: string
  readonly kind?: string
  readonly value?: string
  readonly content?: string
}

const build_synthetic_graph = (): DirectedGraph => {
  const graph = new DirectedGraph()
  graph.addNode("card-root", {
    label: "CARD|card-a|this",
    kind: "cell",
    namespace: "CARD",
    relationLevel: 2,
    value: "10",
  })
  graph.addNode("connector", {
    label: "CARD|card-a|left",
    kind: "cell",
    namespace: "CARD",
    relationLevel: 2,
  })
  graph.addNode("prop-a", {
    label: "prop-a",
    kind: "propagator",
    namespace: "compiler",
    relationLevel: 5,
  })
  graph.addNode("prop-b", {
    label: "prop-b",
    kind: "propagator",
    namespace: "compiler",
    relationLevel: 5,
  })
  graph.addNode("Core|accessor|lookup", {
    label: "Core|accessor|lookup",
    kind: "cell",
    namespace: "Core",
    relationLevel: 5,
  })
  graph.addNode("isolated", {
    label: "CARD|other|this",
    kind: "cell",
    namespace: "CARD",
    relationLevel: 2,
  })

  graph.addEdge("card-root", "prop-a")
  graph.addEdge("prop-a", "connector")
  graph.addEdge("prop-a", "Core|accessor|lookup")
  graph.addEdge("Core|accessor|lookup", "prop-b")

  return graph
}

beforeEach(() => {
  set_global_state(PublicStateCommand.CLEAN_UP)
  internal_clear_source_cells()
  set_merge(merge_temporary_value_set)
  clear_card_metadata()
})

describe("graph_relations - pure relational kernel", () => {
  test("joins edge and kind facts through shared logic variables", () => {
    const graph = build_synthetic_graph()
    const source_var = logic_var("source")
    const target_var = logic_var("target")

    const results = run_goal<{ source: string; target: string }>(
      goal_and(
        edge_fact(graph, source_var, target_var),
        kind(graph, target_var, "propagator")
      ),
      { source: source_var, target: target_var }
    )

    expect(results).toContainEqual({ source: "card-root", target: "prop-a" })
    expect(results).toContainEqual({ source: "Core|accessor|lookup", target: "prop-b" })
  })

  test("reachable and downstream_of expose transitive graph relations", () => {
    const graph = build_synthetic_graph()
    expect(graph_query_reachable(graph, "card-root", "prop-b")).toBe(true)
    expect(graph_query_reachable(graph, "connector", "prop-b")).toBe(false)

    const reachable_ids = query_node_ids(
      graph,
      (node_var) => downstream_of(graph, "card-root", node_var)
    )

    expect(reachable_ids).toContain("prop-a")
    expect(reachable_ids).toContain("Core|accessor|lookup")
    expect(reachable_ids).toContain("prop-b")
  })

  test("card-network and call-graph queries project meaningful subgraphs", () => {
    const graph = build_synthetic_graph()

    const card_graph = graph_query_card_network(graph, "card-a")
    expect(card_graph.hasNode("card-root")).toBe(true)
    expect(card_graph.hasNode("connector")).toBe(true)
    expect(card_graph.hasNode("isolated")).toBe(false)

    const call_graph = graph_query_call_graph(graph)
    expect(query_nodes_by_kind(call_graph, "propagator")).toEqual(["prop-a", "prop-b"])
    expect(call_graph.hasNode("card-root")).toBe(false)
  })

  test("primitive-direct collapses accessor nodes into direct propagator edges", () => {
    const graph = build_synthetic_graph()
    const primitive_graph = graph_query_primitive_direct(graph)

    expect(primitive_graph.hasNode("prop-a")).toBe(true)
    expect(primitive_graph.hasNode("prop-b")).toBe(true)
    expect(primitive_graph.hasNode("Core|accessor|lookup")).toBe(false)
    expect(primitive_graph.hasEdge("prop-a", "prop-b")).toBe(true)
  })

  test("inspect-values reads value-bearing cell rows", () => {
    const graph = build_synthetic_graph()
    const rows = graph_query_inspect_values(graph)

    expect(rows).toContainEqual(
      expect.objectContaining({
        id: "card-root",
        kind: "cell",
        value: "10",
      })
    )
  })

  test("run-query composes edge and kind goals with shared vars", () => {
    const graph = build_synthetic_graph()
    const rows = graph_rel_run_query(graph, {
      where: [
        { op: "edge", source: "?source", target: "?target" },
        { op: "kind", id: "?target", value: "propagator" },
      ],
      select: { source: "?source", target: "?target" },
      limit: 10,
    }) as Array<{ source: string; target: string }>

    expect(rows).toContainEqual({ source: "card-root", target: "prop-a" })
    expect(rows).toContainEqual({ source: "Core|accessor|lookup", target: "prop-b" })
  })

  test("exists-query supports nested or/and clauses", () => {
    const graph = build_synthetic_graph()

    const has_path = graph_rel_exists_query(graph, {
      where: [
        {
          op: "or",
          clauses: [
            {
              op: "and",
              clauses: [
                { op: "reachable", source: "card-root", target: "prop-b" },
                { op: "kind", id: "prop-b", value: "propagator" },
              ],
            },
            { op: "edge", source: "isolated", target: "prop-a" },
          ],
        },
      ],
    })

    const missing_path = graph_rel_exists_query(graph, {
      where: [{ op: "reachable", source: "isolated", target: "prop-b" }],
    })

    expect(has_path).toBe(true)
    expect(missing_path).toBe(false)
  })
})

describe("graph_relations - reactive query propagators", () => {
  test("inspect-values propagator updates when the graph cell is refreshed", async () => {
    init_system()

    const graph_cell = construct_cell("query-gatherer")
    const inspect = construct_cell("query-inspect")
    p_graph_query_inspect_values(graph_cell, inspect)

    const graph1 = build_synthetic_graph()
    update_specialized_reactive_value(graph_cell, cell_id(graph_cell), graph1)
    await execute_all_tasks_sequential(() => {})

    const rows1 = cell_strongest_base_value(inspect) as InspectionRow[]
    expect(Array.isArray(rows1)).toBe(true)
    expect(rows1.some((row) => row.value === "10")).toBe(true)

    const graph2 = build_synthetic_graph()
    graph2.mergeNodeAttributes("card-root", { value: "11" })
    update_specialized_reactive_value(graph_cell, cell_id(graph_cell), graph2)
    await execute_all_tasks_sequential(() => {})

    const rows2 = cell_strongest_base_value(inspect) as InspectionRow[]
    expect(Array.isArray(rows2)).toBe(true)
    expect(rows2.some((row) => row.value === "11")).toBe(true)
  })

  test("card-network and inspect-content propagators answer questions on a real traced card graph", async () => {
    init_system()

    const env = primitive_env("graph-relations-env")
    add_card("graph-rel-card")
    build_card(env)("graph-rel-card")

    const card = guarantee_get_card_metadata("graph-rel-card").card
    const this_cell = internal_cell_this(card)
    update_cell(this_cell, "(+ 1 2 out_graph_rel)")
    await execute_all_tasks_sequential(() => {})

    const gatherer = construct_cell("card-query-gatherer")
    const card_query = construct_cell("card-query-output")
    const content_query = construct_cell("content-query-output")
    const card_id_cell = source_constant_cell("graph-rel-card-id", "graph-rel-card")

    trace_upstream(this_cell, gatherer)
    p_graph_query_card_network(gatherer, card_id_cell, card_query)
    p_graph_query_inspect_content(gatherer, content_query)
    await execute_all_tasks_sequential(() => {})
    await new Promise((resolve) => setTimeout(resolve, 0))
    await execute_all_tasks_sequential(() => {})

    const card_graph = cell_strongest_base_value(card_query)
    expect(is_graphology_graph(card_graph)).toBe(true)
    const typed_card_graph = card_graph as DirectedGraph

    const card_labels: string[] = []
    typed_card_graph.forEachNode((_id, attrs) => {
      if (typeof attrs?.label === "string") {
        card_labels.push(attrs.label)
      }
    })

    expect(card_labels.some((label_text) => label_text.includes("CARD|graph-rel-card"))).toBe(true)

    const content_rows = cell_strongest_base_value(content_query) as InspectionRow[]
    expect(Array.isArray(content_rows)).toBe(true)
    expect(content_rows.some((row) => typeof row.content === "string" && row.content.includes("(+ 1 2 out_graph_rel)"))).toBe(true)
  })

  test("primitive_env registers the new graph query primitives", () => {
    init_system()
    const env = primitive_env("graph-rel-stdlib")
    const reachable_primitive = raw_compile("graph:reachable", env)
    const inspect_content_primitive = raw_compile("graph:query:inspect-content", env)
    const rel_node_ids_primitive = raw_compile("graph:rel:node-ids", env)
    const rel_run_query_primitive = raw_compile("graph:rel:run-query", env)
    execute_all_tasks_sequential(() => {})

    expect((cell_strongest_base_value(reachable_primitive) as { name?: string })?.name).toBe("graph:reachable")
    expect((cell_strongest_base_value(inspect_content_primitive) as { name?: string })?.name).toBe("graph:query:inspect-content")
    expect((cell_strongest_base_value(rel_node_ids_primitive) as { name?: string })?.name).toBe("graph:rel:node-ids")
    expect((cell_strongest_base_value(rel_run_query_primitive) as { name?: string })?.name).toBe("graph:rel:run-query")
  })
})
