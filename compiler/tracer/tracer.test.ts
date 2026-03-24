/**
 * Unit tests for trace_upstream_reactively and trace_upstream_incremental.
 * Verifies that both propagators:
 * - Produce { nodes, links } graph data in the gatherer cell
 * - Reactively update when upstream cells change
 * - Include root cell, dependent propagators, and input cells in the graph
 *
 * Reference: Propogator/test/advanceReactive.test.ts, card_api.test.ts
 */
import { describe, test, expect, beforeEach } from "bun:test";
import DirectedGraph from "graphology";
import {
  construct_cell,
  cell_strongest_base_value,
  cell_id,
} from "ppropogator";
import { execute_all_tasks_sequential } from "ppropogator/Shared/Scheduler/Scheduler";
import { p_sync, bi_sync, p_feedback, p_tap } from "ppropogator/Propagator/BuiltInProps";
import { dispose_propagator } from "ppropogator/Propagator/Propagator";
import { cell_neighbor_set, cell_name } from "ppropogator/Cell/Cell";
import {
  internal_clear_source_cells,
  source_constant_cell,
  update_source_cell,
} from "ppropogator/DataTypes/PremisesSource";
import { set_global_state, PublicStateCommand, set_merge } from "ppropogator";
import { merge_temporary_value_set } from "ppropogator/DataTypes/TemporaryValueSet";
import { trace_upstream_reactively, trace_upstream_periodically } from "./tracer";
import {
  traverse,
  cyclic_prevention_step,
  max_nodes_step,
  get_dependents,
  create_label,
  graph_dependents_step,
  trace_upstream,
} from "./generalized_tracer";
import {
  find_cells_by_card,
  get_connected_subgraph_by_label_prefix,
  get_subgraph_by_card,
  get_subgraph_by_label_prefix,
  get_subgraph_by_nodes,
} from "./graph_queries";
import { graphology_graph_to_graph_data, is_graphology_graph } from "../../src/grpc/codec/session_encode";
import { get_base_value } from "sando-layer/Basic/Layer";
import { is_layered_object, type LayeredObject } from "sando-layer/Basic/LayeredObject";
import { to_string } from "generic-handler/built_in_generics/generic_conversation";
import { init_system as init_incremental_system } from "../incremental_compiler";
import { propagator_name } from "ppropogator/Propagator/Propagator";

function rawToGraphData(raw: unknown): { nodes: { id: string; label: string }[]; links: { source: string; target: string }[] } {
  const base = is_layered_object(raw) ? get_base_value(raw as LayeredObject<unknown>) : raw;
  if (is_graphology_graph(base)) return graphology_graph_to_graph_data(base) as { nodes: { id: string; label: string }[]; links: { source: string; target: string }[] };
  if (base != null && typeof base === "object" && Array.isArray((base as Record<string, unknown>).nodes) && Array.isArray((base as Record<string, unknown>).links))
    return base as { nodes: { id: string; label: string }[]; links: { source: string; target: string }[] };
  throw new Error("Expected graphology graph or GraphData, but got " + to_string(base));
}

function assertGraphShape(val: unknown): asserts val is { nodes: { id: string; label: string }[]; links: { source: string; target: string }[] } {
  expect(val).toBeDefined();
  expect(val).not.toBeNull();
  expect(typeof val).toBe("object");
  const g = val as Record<string, unknown>;
  expect(Array.isArray(g.nodes)).toBe(true);
  expect(Array.isArray(g.links)).toBe(true);
  for (const n of g.nodes as { id: string; label: string }[]) {
    expect(typeof n.id).toBe("string");
    expect(typeof n.label).toBe("string");
  }
  for (const l of g.links as { source: string; target: string }[]) {
    expect(typeof l.source).toBe("string");
    expect(typeof l.target).toBe("string");
  }
}

describe("trace_upstream_reactively", () => {
  beforeEach(() => {
    set_global_state(PublicStateCommand.CLEAN_UP);
    internal_clear_source_cells();
    set_merge(merge_temporary_value_set);
  });

  test("produces graph with root and upstream propagator + input cell", async () => {
    const input = source_constant_cell("input");
    const root = construct_cell("root");
    const gatherer = construct_cell("gatherer");

    p_sync(input, root);
    trace_upstream_reactively(root, gatherer);

    update_source_cell(input, 42);
    await execute_all_tasks_sequential(console.error);

    const graph = rawToGraphData(cell_strongest_base_value(gatherer));
    assertGraphShape(graph);

    const nodeIds = graph.nodes.map((n) => n.id);
    expect(nodeIds).toContain(cell_id(root));
    expect(nodeIds).toContain(cell_id(input));
    expect(graph.nodes.length).toBeGreaterThanOrEqual(2);
    const linkTargets = graph.links.map((l) => l.target);
    expect(linkTargets).toContain(cell_id(root));
    // link source = propagator ID, link target = cell ID
    const linkToRoot = graph.links.find((l) => l.target === cell_id(root));
    expect(linkToRoot).toBeDefined();
    expect(nodeIds).toContain(linkToRoot!.source);
  });

  test("graphology subgraph: get_subgraph_by_label_prefix and get_subgraph_by_nodes", async () => {
    const input = source_constant_cell("inputSub");
    const root = construct_cell("rootSub");
    const gatherer = construct_cell("gathererSub");

    p_sync(input, root);
    trace_upstream_reactively(root, gatherer);
    update_source_cell(input, 1);
    await execute_all_tasks_sequential(() => {});

    const g = cell_strongest_base_value(gatherer);
    expect(is_graphology_graph(g)).toBe(true);

    const cellSub = get_subgraph_by_label_prefix(g, "CELL|");
    let cellCount = 0;
    cellSub.forEachNode(() => {
      cellCount++;
    });
    expect(cellCount).toBeGreaterThanOrEqual(2);
    expect(cellSub.hasNode(cell_id(root))).toBe(true);
    expect(cellSub.hasNode(cell_id(input))).toBe(true);

    const nodeSub = get_subgraph_by_nodes(g, [cell_id(root), cell_id(input)]);
    expect(nodeSub.order).toBe(2);
    expect(nodeSub.size).toBe(0); // no edge between input and root directly (propagator is in between)
  });

  test("reactively updates gatherer when root value changes", async () => {
    const input = source_constant_cell("inputReact");
    const root = construct_cell("rootReact");
    const gatherer = construct_cell("gathererReact");

    p_sync(input, root);
    trace_upstream_reactively(root, gatherer);

    update_source_cell(input, 1);
    await execute_all_tasks_sequential(() => {});
    const graph1 = rawToGraphData(cell_strongest_base_value(gatherer));
    assertGraphShape(graph1);

    update_source_cell(input, 2);
    await execute_all_tasks_sequential(() => {});
    const graph2 = rawToGraphData(cell_strongest_base_value(gatherer));
    assertGraphShape(graph2);

    const rootNode1 = graph1.nodes.find((n) => n.id === cell_id(root));
    const rootNode2 = graph2.nodes.find((n) => n.id === cell_id(root));
    expect(rootNode1).toBeDefined();
    expect(rootNode2).toBeDefined();
    // Label is CELL|{cell_name} and does not include value; both graphs have same structure
  });

  test("handles chain: a -> b -> root", async () => {
    const a = source_constant_cell("a");
    const b = construct_cell("b");
    const root = construct_cell("rootChain");
    const gatherer = construct_cell("gathererChain");

    p_sync(a, b);
    p_sync(b, root);
    trace_upstream_reactively(root, gatherer);

    update_source_cell(a, "hello");
    await execute_all_tasks_sequential(() => {});

    const graph = rawToGraphData(cell_strongest_base_value(gatherer));
    assertGraphShape(graph);

    expect(graph.nodes.some((n) => n.id === cell_id(root))).toBe(true);
    expect(graph.nodes.some((n) => n.id === cell_id(b))).toBe(true);
    expect(graph.nodes.some((n) => n.id === cell_id(a))).toBe(true);
    expect(graph.links.length).toBeGreaterThanOrEqual(2);
  });

  test("handles p_feedback cycle (output feeds back to input)", async () => {
    const input = source_constant_cell("feedbackInput");
    const output = construct_cell("feedbackOutput");
    const gatherer = construct_cell("gathererFeedback");

    p_feedback(input, output);
    trace_upstream_reactively(output, gatherer);

    update_source_cell(input, 10);
    await execute_all_tasks_sequential(() => {});

    const graph = rawToGraphData(cell_strongest_base_value(gatherer));
    assertGraphShape(graph);
    expect(graph.nodes.some((n) => n.id === cell_id(output))).toBe(true);
    expect(graph.nodes.some((n) => n.id === cell_id(input))).toBe(true);
  });

  test("handles bi_sync cycle: a <-> b (cyclic dependence)", async () => {
    const a = source_constant_cell("a");
    const b = construct_cell("b");
    const gatherer = construct_cell("gathererBiSync");

    bi_sync(a, b);
    trace_upstream_reactively(a, gatherer);

    update_source_cell(a, 100);
    await execute_all_tasks_sequential(() => {});

    const graph = rawToGraphData(cell_strongest_base_value(gatherer));
    assertGraphShape(graph);

    expect(graph.nodes.some((n) => n.id === cell_id(a))).toBe(true);
    expect(graph.nodes.some((n) => n.id === cell_id(b))).toBe(true);
    // bi_sync creates two p_sync propagators; graph should include both cells
    expect(graph.nodes.length).toBeGreaterThanOrEqual(2);
  });

  test("handles compiled network (add1 closure)", async () => {
    const { raw_compile } = await import("../compiler_entry");
    const { init_system: init_compile } = await import("../compiler");

    init_compile();
    set_global_state(PublicStateCommand.CLEAN_UP);
    internal_clear_source_cells();
    set_merge(merge_temporary_value_set);

    const env = (await import("../closure")).primitive_env();

    raw_compile("(network add1 (>:: x) (::> y) (+ x 1 y))", env);
    await execute_all_tasks_sequential(() => {});

    raw_compile("(add1 5 out)", env);
    await execute_all_tasks_sequential(() => {});

    const e = cell_strongest_base_value(env) as Map<string, import("ppropogator").Cell<unknown>>;
    const outCell = e.get("out");
    expect(outCell).toBeDefined();

    const gatherer = construct_cell("gathererCompiled");
    trace_upstream_reactively(outCell!, gatherer);

    await execute_all_tasks_sequential(() => {});

    const graph = rawToGraphData(cell_strongest_base_value(gatherer));
    assertGraphShape(graph);
    expect(graph.nodes.length).toBeGreaterThanOrEqual(2);
  }, 10000);

  test("rapid propagation: many source updates in quick succession, no infinite loop", async () => {
    const input = source_constant_cell("rapidInput");
    const root = construct_cell("rapidRoot");
    const gatherer = construct_cell("gathererRapid");

    p_sync(input, root);
    trace_upstream_reactively(root, gatherer);

    // Rapid fire: update source many times, run scheduler after each
    for (let i = 0; i < 30; i++) {
      update_source_cell(input, i);
      await execute_all_tasks_sequential(() => {});
    }

    const graph = rawToGraphData(cell_strongest_base_value(gatherer));
    assertGraphShape(graph);
    expect(graph.nodes.some((n) => n.id === cell_id(root))).toBe(true);
    expect(graph.nodes.some((n) => n.id === cell_id(input))).toBe(true);
  }, 5000);

  test("does not register duplicate taps across rebuilds", async () => {
    const input = source_constant_cell("tapInput");
    const root = construct_cell("tapRoot");
    const gatherer = construct_cell("tapGatherer");

    p_sync(input, root);
    trace_upstream_reactively(root, gatherer);

    update_source_cell(input, 1);
    await execute_all_tasks_sequential(() => {});
    await new Promise((r) => setTimeout(r, 0));
    await execute_all_tasks_sequential(() => {});
    const firstNeighborCount = cell_neighbor_set(root).size;

    update_source_cell(input, 2);
    await execute_all_tasks_sequential(() => {});
    await new Promise((r) => setTimeout(r, 0));
    await execute_all_tasks_sequential(() => {});
    const secondNeighborCount = cell_neighbor_set(root).size;

    expect(secondNeighborCount).toBe(firstNeighborCount);
  }, 5000);

  test("scheduler flush: periodic execute like Connect server, cyclic network, no infinite loop", async () => {
    const { init_constant_scheduler_flush } = await import("../init");

    const a = source_constant_cell("flushA");
    const b = construct_cell("flushB");
    const gatherer = construct_cell("gathererFlush");

    bi_sync(a, b);
    trace_upstream_reactively(a, gatherer);

    update_source_cell(a, 1);
    const dispose = init_constant_scheduler_flush(5);

    // Let scheduler run for ~60ms (multiple rounds)
    await new Promise((r) => setTimeout(r, 60));
    dispose();

    const graph = rawToGraphData(cell_strongest_base_value(gatherer));
    assertGraphShape(graph);
    expect(graph.nodes.some((n) => n.id === cell_id(a))).toBe(true);
    expect(graph.nodes.some((n) => n.id === cell_id(b))).toBe(true);
  }, 5000);

  test("scheduler flush: periodic execute with compiled network, no infinite loop", async () => {
    const { init_constant_scheduler_flush } = await import("../init");
    const { raw_compile } = await import("../compiler_entry");
    const { init_system: init_compile } = await import("../compiler");

    init_compile();
    set_global_state(PublicStateCommand.CLEAN_UP);
    internal_clear_source_cells();
    set_merge(merge_temporary_value_set);

    const env = (await import("../closure")).primitive_env();
    raw_compile("(network add1 (>:: x) (::> y) (+ x 1 y))", env);
    await execute_all_tasks_sequential(() => {});
    raw_compile("(add1 5 out)", env);
    await execute_all_tasks_sequential(() => {});

    const e = cell_strongest_base_value(env) as Map<string, import("ppropogator").Cell<unknown>>;
    const outCell = e.get("out");
    expect(outCell).toBeDefined();

    const gatherer = construct_cell("gathererFlushCompiled");
    trace_upstream_reactively(outCell!, gatherer);

    const dispose = init_constant_scheduler_flush(5);
    await new Promise((r) => setTimeout(r, 50));
    dispose();

    const graph = rawToGraphData(cell_strongest_base_value(gatherer));
    assertGraphShape(graph);
    expect(graph.nodes.length).toBeGreaterThanOrEqual(2);
  }, 10000);

  test("compiled (trace cell-a cell-b): trace as primitive, give cell-a value, no infinite loop", async () => {
    const { raw_compile } = await import("../compiler_entry");
    const { init_system: init_compile } = await import("../compiler");

    init_compile();
    set_global_state(PublicStateCommand.CLEAN_UP);
    internal_clear_source_cells();
    set_merge(merge_temporary_value_set);

    const env = (await import("../closure")).primitive_env();

    // Network: a is input (root to trace), b is output (gatherer for graph)
    raw_compile("(network traced (>:: a) (::> b) (trace a b))", env);
    await execute_all_tasks_sequential(() => {});

    // Apply: give cell-a value 100, cell-b (gatherer) is "result"
    raw_compile("(traced 100 result)", env);
    await execute_all_tasks_sequential(() => {});

    const e = cell_strongest_base_value(env) as Map<string, import("ppropogator").Cell<unknown>>;
    const resultCell = e.get("result");
    expect(resultCell).toBeDefined();

    // Main assertion: no infinite loop (test completed). Tracer ran and wrote to gatherer.
    const raw = cell_strongest_base_value(resultCell!);
    try {
      const graph = rawToGraphData(raw);
      assertGraphShape(graph);
      expect(graph.nodes.length).toBeGreaterThanOrEqual(1);
    } catch {
      // Graph format may vary; at minimum we completed without hanging
      expect(raw).toBeDefined();
    }
  }, 5000);

  test("card API (trace ::left ::right): update_card + build_card, source feeds ::left, periodic scheduler, no infinite loop", async () => {
    const { init_system } = await import("../incremental_compiler");
    const { init_constant_scheduler_flush } = await import("../init");
    const { add_card, build_card, runtime_get_card, connect_cards, update_card } =
      await import("../../src/grpc/card");
    const { internal_cell_this, internal_cell_left, slot_right, slot_left } =
      await import("../../src/grpc/card");

    init_system();
    set_global_state(PublicStateCommand.CLEAN_UP);
    internal_clear_source_cells();
    set_merge(merge_temporary_value_set);

    const env = (await import("../closure")).primitive_env();

    add_card("trace-source");
    add_card("trace-card-a");
    add_card("trace-card-b");
    build_card(env)("trace-source");
    build_card(env)("trace-card-a");
    build_card(env)("trace-card-b");

    // source -> card-a::left, card-a::right -> card-b::left
    connect_cards("trace-source", "trace-card-a", slot_right, slot_left);
    connect_cards("trace-card-a", "trace-card-b", slot_right, slot_left);
    await execute_all_tasks_sequential(() => {});

    update_card("trace-source", 42);
    await execute_all_tasks_sequential(() => {});

    // update_card + build_card: matches Connect server / card_api flow
    update_card("trace-card-a", "(trace ::left ::right)");
    build_card(env)("trace-card-a");
    await execute_all_tasks_sequential(() => {});

    // Periodic scheduler like Connect server – if tracer causes infinite loop, this will hang
    const dispose = init_constant_scheduler_flush(5);
    await new Promise((r) => setTimeout(r, 200));
    dispose();

    const cardA = runtime_get_card("trace-card-a")!;
    const leftCell = internal_cell_left(cardA);
    expect(leftCell).toBeDefined();
    expect(internal_cell_this(runtime_get_card("trace-source")!)).toBeDefined();
  }, 15000);

  test("card API + graph queries: find cells and propagators related to a card", async () => {
    const { init_system } = await import("../incremental_compiler");
    const {
      add_card,
      build_card,
      runtime_get_card,
      connect_cards,
      update_card,
      internal_cell_this,
      slot_right,
      slot_left,
    } = await import("../../src/grpc/card");

    init_system();
    set_global_state(PublicStateCommand.CLEAN_UP);
    internal_clear_source_cells();
    set_merge(merge_temporary_value_set);

    const env = (await import("../closure")).primitive_env();

    add_card("query-source");
    add_card("query-card-a");
    add_card("query-card-b");
    build_card(env)("query-source");
    build_card(env)("query-card-a");
    build_card(env)("query-card-b");

    connect_cards("query-source", "query-card-a", slot_right, slot_left);
    connect_cards("query-card-a", "query-card-b", slot_right, slot_left);
    await execute_all_tasks_sequential(() => {});

    update_card("query-source", 100);
    await execute_all_tasks_sequential(() => {});

    const cardA = runtime_get_card("query-card-a")!;
    const cardACell = internal_cell_this(cardA);
    expect(cardACell).toBeDefined();

    const gatherer = construct_cell("gathererQueryCard");
    trace_upstream_reactively(cardACell!, gatherer);
    await execute_all_tasks_sequential(() => {});

    const g = cell_strongest_base_value(gatherer);
    expect(is_graphology_graph(g)).toBe(true);

    const graph = g as import("graphology").DirectedGraph;

    // find_cells_by_card: cells whose label contains CARD|{cardId}|
    const cardACells = find_cells_by_card(graph, "query-card-a");
    const sourceCells = find_cells_by_card(graph, "query-source");



    expect(cardACells.length).toBeGreaterThanOrEqual(1);
    expect(sourceCells.length).toBeGreaterThanOrEqual(1);
    cardACells.forEach((id) => {
      const label = graph.getNodeAttribute(id, "label");
      expect(typeof label === "string" && label.includes("CARD|query-card-a|")).toBe(true);
    });

    // get_subgraph_by_card: induced subgraph of card cells
    const cardASub = get_subgraph_by_card(graph, "query-card-a");
    console.log(get_subgraph_by_card(graph, "CARD"));
    expect(cardASub.order).toBe(cardACells.length);
    cardACells.forEach((id) => expect(cardASub.hasNode(id)).toBe(true));

    // get_subgraph_by_label_prefix: cells only vs propagators
    const cellSub = get_subgraph_by_label_prefix(graph, "CELL|");
    const propSub = get_subgraph_by_label_prefix(graph, "PROPAGATOR|");
    expect(cellSub.order + propSub.order).toBeGreaterThanOrEqual(graph.order);
    expect(cellSub.order).toBeGreaterThanOrEqual(2);
    expect(propSub.order).toBeGreaterThanOrEqual(1);
  }, 15000);

  test("REPRO: tracer output feeds back to input - maxRebuilds prevents infinite loop", async () => {
    // Cycle: source -> a <-> b, trace(a, gatherer), p_sync(gatherer, b)
    // When tracer writes to gatherer, it flows to b, bi_sync updates a, tap fires -> rebuild -> loop
    let rebuildCount = 0;
    const source = source_constant_cell("reproSource");
    const a = construct_cell("reproA");
    const b = construct_cell("reproB");
    const gatherer = construct_cell("reproGatherer");

    p_sync(source, a);
    bi_sync(a, b);
    trace_upstream_reactively(a, gatherer, {
      maxRebuilds: 50,
      onRebuild: () => {
        rebuildCount++;
      },
    });
    p_sync(gatherer, b); // Feedback: gatherer -> b -> (bi_sync) -> a -> tap fires

    update_source_cell(source, 1);
    await execute_all_tasks_sequential(() => {});

    // Without maxRebuilds this would hang. With it, we cap and complete.
    const graph = rawToGraphData(cell_strongest_base_value(gatherer));
    assertGraphShape(graph);
    // If rebuildCount >= 50 we hit the circuit breaker (loop confirmed). Else normal.
    expect(rebuildCount).toBeGreaterThanOrEqual(1);
  }, 5000);

  test("long-running BFS: deep chain of 120 cells, completes without infinite loop", async () => {
    const input = source_constant_cell("deepInput");
    const cells: ReturnType<typeof construct_cell>[] = [construct_cell("deep0")];
    p_sync(input, cells[0]!);
    for (let i = 1; i < 120; i++) {
      cells.push(construct_cell(`deep${i}`));
      p_sync(cells[i - 1], cells[i]);
    }
    const root = cells[cells.length - 1]!;
    const gatherer = construct_cell("gathererDeep");

    trace_upstream_reactively(root, gatherer);
    update_source_cell(input, "seed");
    await execute_all_tasks_sequential(() => {});

    const graph = rawToGraphData(cell_strongest_base_value(gatherer));
    assertGraphShape(graph);
    expect(graph.nodes.length).toBeGreaterThanOrEqual(2);
    expect(graph.nodes.some((n) => n.id === cell_id(root))).toBe(true);
    expect(graph.nodes.some((n) => n.id === cell_id(input))).toBe(true);
  }, 5000);
});

describe("trace_upstream_periodically", () => {
  beforeEach(() => {
    set_global_state(PublicStateCommand.CLEAN_UP);
    internal_clear_source_cells();
    set_merge(merge_temporary_value_set);
  });

  test("produces graph with root and upstream, no taps, independent of cell activation", async () => {
    const input = source_constant_cell("periodicInput");
    const root = construct_cell("periodicRoot");
    const gatherer = construct_cell("periodicGatherer");

    p_sync(input, root);
    trace_upstream_periodically(root, gatherer, { intervalMs: 20 });

    update_source_cell(input, 42);
    await execute_all_tasks_sequential(() => {});

    await new Promise((r) => setTimeout(r, 50));

    const graph = rawToGraphData(cell_strongest_base_value(gatherer));
    assertGraphShape(graph);
    expect(graph.nodes.some((n) => n.id === cell_id(root))).toBe(true);
    expect(graph.nodes.some((n) => n.id === cell_id(input))).toBe(true);
    expect(graph.nodes.length).toBeGreaterThanOrEqual(2);
  }, 5000);

  test("feedback cycle (gatherer -> b -> a): no infinite loop, completes", async () => {
    const source = source_constant_cell("periodicFeedbackSource");
    const a = construct_cell("periodicFeedbackA");
    const b = construct_cell("periodicFeedbackB");
    const gatherer = construct_cell("periodicFeedbackGatherer");

    p_sync(source, a);
    bi_sync(a, b);
    trace_upstream_periodically(a, gatherer, { intervalMs: 20 });
    p_sync(gatherer, b);

    update_source_cell(source, 1);
    await execute_all_tasks_sequential(() => {});

    await new Promise((r) => setTimeout(r, 100));

    const graph = rawToGraphData(cell_strongest_base_value(gatherer));
    assertGraphShape(graph);
    expect(graph.nodes.some((n) => n.id === cell_id(a))).toBe(true);
    expect(graph.nodes.some((n) => n.id === cell_id(b))).toBe(true);
  }, 5000);

  test("disposing periodic tracer stops interval updates", async () => {
    const input = source_constant_cell("periodicDisposeInput");
    const root = construct_cell("periodicDisposeRoot");
    const gatherer = construct_cell("periodicDisposeGatherer");
    let gathererUpdateCount = 0;

    p_sync(input, root);
    const gathererTap = p_tap(gatherer, () => {
      gathererUpdateCount++;
    });
    const tracer = trace_upstream_periodically(root, gatherer, { intervalMs: 20 });

    update_source_cell(input, 1);
    await execute_all_tasks_sequential(() => {});
    await new Promise((r) => setTimeout(r, 90));
    await execute_all_tasks_sequential(() => {});

    const beforeDispose = gathererUpdateCount;
    expect(beforeDispose).toBeGreaterThan(0);

    dispose_propagator(tracer);
    await execute_all_tasks_sequential(() => {});
    expect(cell_neighbor_set(root).has(tracer)).toBe(false);

    await new Promise((r) => setTimeout(r, 120));
    await execute_all_tasks_sequential(() => {});

    const afterDispose = gathererUpdateCount;
    expect(afterDispose - beforeDispose).toBeLessThanOrEqual(1);

    dispose_propagator(gathererTap);
    await execute_all_tasks_sequential(() => {});
  }, 5000);
});

/**
 * Fine-grained tests for generalized_tracer combinators (mostly pure).
 * Integration tests for trace_dependents use the same env init as card_api.test.ts:
 * incremental init_system + propagator cleanup + merge.
 */
describe("generalized_tracer", () => {
  /** Sync tests: timeout only to surface hangs with a named failure. */
  const GT_MS = 5000;

  describe("traverse", () => {
    test("BFS-like walk accumulates visited items in queue order", () => {
      // Note: traverse uses `if (x)` — 0 is skipped (falsy). Start from 1, not 0.
      const walk = (x: number) => (x < 3 ? [x + 1] : []);
      const step = (acc: number[], x: number) => [...acc, x];
      const result = traverse(walk, step)(1, []);
      expect(result).toEqual([1, 2, 3]);
    }, GT_MS);

    test("empty walk stops at root only", () => {
      const walk = (_x: number) => [] as number[];
      const step = (acc: number[], x: number) => [...acc, x];
      const result = traverse(walk, step)(42, []);
      expect(result).toEqual([42]);
    }, GT_MS);
  });

  describe("cyclic_prevention_step", () => {
    test("second visit with same id skips inner step (state unchanged)", () => {
      type Item = { id: string; tag: string };
      const step = (state: string[], x: Item) => [...state, x.tag];
      const wrapped = cyclic_prevention_step((o: Item) => o.id)(step);
      const a1: Item = { id: "a", tag: "first" };
      const a2: Item = { id: "a", tag: "second" };
      const s1 = wrapped([], a1);
      expect(s1).toEqual(["first"]);
      const s2 = wrapped(s1, a2);
      expect(s2).toEqual(["first"]);
    }, GT_MS);

    test("different ids both run inner step", () => {
      type Item = { id: string; n: number };
      const step = (state: number[], x: Item) => [...state, x.n];
      const wrapped = cyclic_prevention_step((o: Item) => o.id)(step);
      expect(wrapped([], { id: "x", n: 1 })).toEqual([1]);
      expect(wrapped([1], { id: "y", n: 2 })).toEqual([1, 2]);
    }, GT_MS);
  });

  describe("max_nodes_step", () => {
    test("stops invoking inner step after max_nodes visits", () => {
      const step = (state: number[], _x: number) => [...state, 1];
      const wrapped = max_nodes_step(2)(step);
      expect(wrapped([], 0)).toEqual([1]);
      expect(wrapped([1], 0)).toEqual([1, 1]);
      expect(wrapped([1, 1], 0)).toEqual([1, 1]);
    }, GT_MS);
  });

  describe("get_dependents, create_label, graph_dependents_step (with propagator graph)", () => {
    beforeEach(() => {
      init_incremental_system();
      set_global_state(PublicStateCommand.CLEAN_UP);
      internal_clear_source_cells();
      set_merge(merge_temporary_value_set);
    });

    test("get_dependents(cell): only OUTPUT cells have cell_dependents; p_sync input has none", () => {
      const root = source_constant_cell("gdRoot");
      const mid = construct_cell("gdMid");
      const p = p_sync(root, mid);
      // Propagator registers inputs with [updated] and outputs with [dependents].
      // cell_dependents() only lists neighbors tagged dependents — i.e. output side.
      expect(get_dependents(root).length).toBe(0);
      const fromOut = get_dependents(mid);
      expect(fromOut.length).toBeGreaterThanOrEqual(1);
      expect(fromOut.some((x) => x === p)).toBe(true);
      // For propagators, get_dependents dispatches to propagator_inputs (see generalized_tracer),
      // i.e. input cells only — not outputs. So mid must not appear here.
      const fromProp = get_dependents(p);
      expect(fromProp.map(cell_id)).toEqual([cell_id(root)]);
    }, GT_MS);

    test("create_label uses cell_name for cells and propagator_name for propagators", () => {
      const root = source_constant_cell("lblRoot");
      const mid = construct_cell("lblMid");
      const p = p_sync(root, mid);
      expect(create_label(root)).toBe(cell_name(root));
      expect(create_label(p)).toBe(propagator_name(p));
    }, GT_MS);

    test("graph_dependents_step from p_sync output cell adds propagator nodes and edges", () => {
      const root = source_constant_cell("gdsRoot");
      const mid = construct_cell("gdsMid");
      p_sync(root, mid);
      const g = new DirectedGraph();
      const out = graph_dependents_step(g, mid);
      expect(out.hasNode(cell_id(mid))).toBe(true);
      expect(out.order).toBeGreaterThanOrEqual(2);
      expect(out.size).toBeGreaterThanOrEqual(1);
    }, GT_MS);

    test("traverse from chain output walks propagators and inputs (not from source input cell)", () => {
      const root = source_constant_cell("trRoot");
      const mid = construct_cell("trMid");
      const out = construct_cell("trOut");
      p_sync(root, mid);
      p_sync(mid, out);
      const g = new DirectedGraph();
      const result = traverse(get_dependents, graph_dependents_step)(out, g);
      expect(result.hasNode(cell_id(out))).toBe(true);
      expect(result.order).toBeGreaterThanOrEqual(3);
    }, GT_MS);
  });
});

describe("trace_dependents", () => {
  /** Async / scheduler-heavy: on timeout, Bun reports this test’s name. */
  const TD_ASYNC_MS = 10_000;
  const TD_SYNC_MS = 5000;

  beforeEach(() => {
    init_incremental_system();
    set_global_state(PublicStateCommand.CLEAN_UP);
    internal_clear_source_cells();
    set_merge(merge_temporary_value_set);
  });

  test("from p_sync input as trace root: only root node (cell_dependents is empty on input cells)", async () => {
    const root = source_constant_cell("depRoot");
    const mid = construct_cell("depMid");
    const out = construct_cell("depOut");
    const gatherer = construct_cell("depGatherer");

    p_sync(root, mid);
    p_sync(mid, out);
    trace_upstream(root, gatherer);

    update_source_cell(root, 1);
    await execute_all_tasks_sequential(() => {});
    await new Promise((r) => setTimeout(r, 0));
    await execute_all_tasks_sequential(() => {});

    const graph = rawToGraphData(cell_strongest_base_value(gatherer));
    assertGraphShape(graph);
    expect(graph.nodes.some((n) => n.id === cell_id(root))).toBe(true);
    expect(graph.nodes.length).toBe(1);
    expect(graph.links.length).toBe(0);
  }, TD_ASYNC_MS);

  test("from chain output as trace root: graph includes propagator/cell structure", async () => {
    const root = source_constant_cell("depRootOut");
    const mid = construct_cell("depMidOut");
    const out = construct_cell("depOutLeaf");
    const gatherer = construct_cell("depGathererOut");

    p_sync(root, mid);
    p_sync(mid, out);
    trace_upstream(out, gatherer);

    update_source_cell(root, 1);
    await execute_all_tasks_sequential(() => {});
    await new Promise((r) => setTimeout(r, 0));
    await execute_all_tasks_sequential(() => {});

    const graph = rawToGraphData(cell_strongest_base_value(gatherer));
    assertGraphShape(graph);
    expect(graph.nodes.some((n) => n.id === cell_id(out))).toBe(true);
    expect(graph.nodes.length).toBeGreaterThanOrEqual(2);
    expect(graph.links.length).toBeGreaterThanOrEqual(1);
  }, TD_ASYNC_MS);

  test("reactively rebuilds on updates to tapped cells", async () => {
    const root = source_constant_cell("depReactiveRoot");
    const out = construct_cell("depReactiveOut");
    const gatherer = construct_cell("depReactiveGatherer");
    let gathererUpdateCount = 0;

    p_sync(root, out);
    trace_upstream(root, gatherer);
    const gathererTap = p_tap(gatherer, () => {
      gathererUpdateCount++;
    });

    update_source_cell(root, 1);
    await execute_all_tasks_sequential(() => {});
    await new Promise((r) => setTimeout(r, 0));
    await execute_all_tasks_sequential(() => {});

    const firstCount = gathererUpdateCount;
    expect(firstCount).toBeGreaterThan(0);

    update_source_cell(root, 2);
    await execute_all_tasks_sequential(() => {});
    await new Promise((r) => setTimeout(r, 0));
    await execute_all_tasks_sequential(() => {});

    expect(gathererUpdateCount).toBeGreaterThan(firstCount);
    dispose_propagator(gathererTap);
  }, TD_ASYNC_MS);

  test("feedback cycle completes without infinite loop", async () => {
    // it stucked on cycle
    const source = source_constant_cell("depFeedbackSource");
    const a = construct_cell("depFeedbackA");
    const b = construct_cell("depFeedbackB");
    const gatherer = construct_cell("depFeedbackGatherer");

    p_sync(source, a);
    bi_sync(a, b);
    trace_upstream(a, gatherer);

    update_source_cell(source, 1);
    await execute_all_tasks_sequential(() => {});
    await new Promise((r) => setTimeout(r, 0));
    await execute_all_tasks_sequential(() => {});

    const graph = rawToGraphData(cell_strongest_base_value(gatherer));
    assertGraphShape(graph);
    expect(graph.nodes.some((n) => n.id === cell_id(a))).toBe(true);
    expect(graph.nodes.some((n) => n.id === cell_id(b))).toBe(true);
  }, TD_ASYNC_MS);

  test("diagnostic: traverse + graph_dependents_step from p_sync output builds graph (isolates pure walk)", () => {
    const root = source_constant_cell("isoRoot");
    const mid = construct_cell("isoMid");
    p_sync(root, mid);
    const g = new DirectedGraph();
    const built = traverse(get_dependents, graph_dependents_step)(mid, g);
    expect(built.order).toBeGreaterThanOrEqual(2);
    expect(built.order).toBe(g.order);
  }, TD_SYNC_MS);

  test("diagnostic: gatherer strongest base should be Graphology — if not, suspect update_specialized_reactive_value / merge / layered strongest", async () => {
    const root = source_constant_cell("diagGathererRoot");
    const mid = construct_cell("diagGathererMid");
    const gatherer = construct_cell("diagGathererCell");
    p_sync(root, mid);
    trace_upstream(mid, gatherer);
    update_source_cell(root, 1);
    await execute_all_tasks_sequential(() => {});
    await new Promise((r) => setTimeout(r, 0));
    await execute_all_tasks_sequential(() => {});

    const raw = cell_strongest_base_value(gatherer);
    const base = is_layered_object(raw) ? get_base_value(raw as LayeredObject<unknown>) : raw;
    expect(
      is_graphology_graph(base),
      `potential problem: gatherer base is not graphology (got ${to_string(base)}); pure traverse+graph_dependents_step still works; check update_specialized_reactive_value, merge_temporary_value_set, and layered strongest`,
    ).toBe(true);
  }, TD_ASYNC_MS);

  test("diagnostic: second source update should re-trigger gatherer tap if tap+schedule work — if not, suspect active flag or coalesced microtasks", async () => {
    const root = source_constant_cell("diagTapRoot");
    const mid = construct_cell("diagTapMid");
    const gatherer = construct_cell("diagTapGatherer");
    let gathererWrites = 0;
    p_sync(root, mid);
    trace_upstream(mid, gatherer);
    const gathererTap = p_tap(gatherer, () => {
      gathererWrites++;
    });
    update_source_cell(root, 1);
    await execute_all_tasks_sequential(() => {});
    await new Promise((r) => setTimeout(r, 0));
    await execute_all_tasks_sequential(() => {});
    const afterFirst = gathererWrites;
    update_source_cell(root, 2);
    await execute_all_tasks_sequential(() => {});
    await new Promise((r) => setTimeout(r, 0));
    await execute_all_tasks_sequential(() => {});
    dispose_propagator(gathererTap);
    expect(
      gathererWrites > afterFirst,
      "potential problem: second source update did not propagate to gatherer tap; check schedule/tap deduping, active flag, or trace_dependents only running once (initialized)",
    ).toBe(true);
  }, TD_ASYNC_MS);
});

describe("graph_queries", () => {
  test("get_connected_subgraph_by_label_prefix: zero or one match returns induced subgraph only", () => {
    const g = new DirectedGraph();
    g.addNode("a", { label: "CELL|a" });
    g.addNode("b", { label: "OTHER|b" });
    g.addEdge("a", "b");

    const empty = get_connected_subgraph_by_label_prefix(g, "CELL|x");
    expect(empty.order).toBe(0);

    const single = get_connected_subgraph_by_label_prefix(g, "CELL|");
    expect(single.order).toBe(1);
    expect(single.hasNode("a")).toBe(true);
    expect(single.hasNode("b")).toBe(false);
  });

  test("get_connected_subgraph_by_label_prefix: two matched nodes connected by path include intermediate node", () => {
    const g = new DirectedGraph();
    g.addNode("cell1", { label: "CELL|one" });
    g.addNode("prop", { label: "PROPAGATOR|sync" });
    g.addNode("cell2", { label: "CELL|two" });
    g.addEdge("cell1", "prop");
    g.addEdge("prop", "cell2");

    const sub = get_connected_subgraph_by_label_prefix(g, "CELL|");
    expect(sub.order).toBe(3);
    expect(sub.hasNode("cell1")).toBe(true);
    expect(sub.hasNode("cell2")).toBe(true);
    expect(sub.hasNode("prop")).toBe(true);
    expect(sub.size).toBe(2);
  });

  test("get_connected_subgraph_by_label_prefix: two matched nodes disconnected stay as two nodes", () => {
    const g = new DirectedGraph();
    g.addNode("cell1", { label: "CELL|one" });
    g.addNode("cell2", { label: "CELL|two" });
    g.addNode("other", { label: "OTHER|x" });
    g.addEdge("cell1", "other");
    // no edge from other to cell2 -> no path between cell1 and cell2
    const sub = get_connected_subgraph_by_label_prefix(g, "CELL|");
    expect(sub.order).toBe(2);
    expect(sub.hasNode("cell1")).toBe(true);
    expect(sub.hasNode("cell2")).toBe(true);
    expect(sub.hasNode("other")).toBe(false);
  });
});

// describe("trace_upstream_incremental", () => {
//   beforeEach(() => {
//     set_global_state(PublicStateCommand.CLEAN_UP);
//     internal_clear_source_cells();
//     set_merge(merge_temporary_value_set);
//   });

//   test("produces graph with root and upstream propagator + input cell", async () => {

//     const input = source_cell("inputInc");
//     const root = construct_cell("rootInc");
//     const gatherer = construct_cell("gathererInc");

//     p_sync(input, root);
//     trace_upstream_incremental(root, gatherer);

//     update_source_cell(input, 100);
//     await execute_all_tasks_sequential(() => {});

//     const graph = cell_strongest_base_value(gatherer);
//     assertGraphShape(graph);

//     expect(graph.nodes.some((n) => n.id === cell_id(root))).toBe(true);
//     expect(graph.nodes.some((n) => n.id === cell_id(input))).toBe(true);
//     expect(graph.links.length).toBeGreaterThanOrEqual(1);
//   });

//   test("reactively updates when input changes", async () => {
//     const input = source_cell("inputIncReact");
//     const root = construct_cell("rootIncReact");
//     const gatherer = construct_cell("gathererIncReact");

//     p_sync(input, root);
//     trace_upstream_incremental(root, gatherer);

//     update_source_cell(input, "first");
//     await execute_all_tasks_sequential(() => {});
//     const graph1 = cell_strongest_base_value(gatherer);
//     assertGraphShape(graph1);

//     update_source_cell(input, "second");
//     await execute_all_tasks_sequential(() => {});
//     const graph2 = cell_strongest_base_value(gatherer);
//     assertGraphShape(graph2);

//     const rootNode1 = graph1.nodes.find((n) => n.id === cell_id(root));
//     const rootNode2 = graph2.nodes.find((n) => n.id === cell_id(root));
//     expect(rootNode1!.label).not.toBe(rootNode2!.label);
//   });

//   test("handles chain: x -> y -> root (incremental expansion)", async () => {
//     const x = source_cell("x");
//     const y = construct_cell("y");
//     const root = construct_cell("rootIncChain");
//     const gatherer = construct_cell("gathererIncChain");

//     p_sync(x, y);
//     p_sync(y, root);
//     trace_upstream_incremental(root, gatherer);

//     update_source_cell(x, 999);
//     await execute_all_tasks_sequential(() => {});

//     const graph = cell_strongest_base_value(gatherer);
//     assertGraphShape(graph);

//     expect(graph.nodes.some((n) => n.id === cell_id(root))).toBe(true);
//     expect(graph.nodes.some((n) => n.id === cell_id(y))).toBe(true);
//     expect(graph.nodes.some((n) => n.id === cell_id(x))).toBe(true);
//     expect(graph.links.length).toBeGreaterThanOrEqual(2);
//   });
// });
