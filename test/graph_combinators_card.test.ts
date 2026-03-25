/**
 * Integration tests: graph combinators on real compiled cards.
 *
 * These tests use the same setup as card_api.test.ts and abstraction_level_lain.test.ts:
 *   primitive_env() → add_card() → build_card(env)(id) → update_cell(thisCell, program)
 *
 * They verify that each combinator from graph_combinators.ts produces correct results
 * when operating on real compiler-generated propagator graphs, not hand-built fixtures.
 *
 * One describe block per query from docs/propagation-tracing.md.
 */

import { expect, test, describe, beforeEach } from "bun:test"
import { DirectedGraph } from "graphology"
import {
    cell_strongest_base_value,
    cell_id,
    type Cell,
} from "ppropogator"
import { construct_cell, update_cell } from "ppropogator/Cell/Cell"
import { execute_all_tasks_sequential } from "ppropogator/Shared/Scheduler/Scheduler"
import { get_dependents } from "ppropogator/Shared/Generics"

import {
    add_card,
    build_card,
    connect_cards,
    clear_card_metadata,
    guarantee_get_card_metadata,
    internal_cell_this,
    internal_cell_left,
    internal_cell_right,
    slot_right,
    slot_left,
} from "../src/grpc/card"
import { primitive_env } from "../compiler/closure"
import { init_system } from "../compiler/incremental_compiler"
import { run } from "../compiler/compiler_entry"
import { init_constant_scheduler_flush } from "../compiler/init"

import { trace_upstream, trace_downstream, trace_periodic } from "../compiler/tracer/generalized_tracer"
import {
    subgraph_by_kind,
    subgraph_by_namespace,
    subgraph_by_level,
    intersect_graphs,
    union_graphs,
    collapse_accessor_paths,
    annotate_cell_content,
} from "../compiler/tracer/graph_combinators"

// ── Setup helpers (mirror card_api.test.ts) ───────────────────────────────────

beforeEach(() => {
    init_system()
    clear_card_metadata()
})

const get_card = (id: string) => guarantee_get_card_metadata(id).card
const wait = (ms: number): Promise<void> => new Promise(resolve => setTimeout(resolve, ms))

/** Trace upstream from cell, wait for scheduler, return the Graphology graph. */
const trace_and_get = (root: Cell<any>, name: string): DirectedGraph => {
    const gatherer = construct_cell(name)
    trace_upstream(root, gatherer)
    execute_all_tasks_sequential(() => {})
    return cell_strongest_base_value(gatherer) as DirectedGraph
}

// ── Q1: all network for a card ────────────────────────────────────────────────

describe("Q1: card network — namespace filter on a built card", () => {
    test("graph:namespace '::' isolates card slot cells after build_card", () => {
        const env = primitive_env("q1-env")
        add_card("q1")
        build_card(env)("q1")
        execute_all_tasks_sequential(() => {})

        const this_cell = internal_cell_this(get_card("q1"))
        const graph = trace_and_get(this_cell, "q1-gatherer")

        expect(graph.order).toBeGreaterThan(0)

        // slot cells are named "::this", "::left", etc. → namespace prefix is "::"
        const card_sg = subgraph_by_namespace(graph, "::")
        expect(card_sg.order).toBeGreaterThan(0)

        // every node in the result is "::" namespaced (card slot cells)
        card_sg.forEachNode((_, attrs) => {
            expect(String(attrs.namespace ?? "").startsWith("::")).toBe(true)
        })
    })

    test("graph has structured kind attr — no unknown kinds", () => {
        const env = primitive_env("q1b-env")
        add_card("q1b")
        build_card(env)("q1b")
        execute_all_tasks_sequential(() => {})

        const graph = trace_and_get(internal_cell_this(get_card("q1b")), "q1b-g")

        graph.forEachNode((_, attrs) => {
            expect(["cell", "propagator"]).toContain(attrs.kind)
        })
    })

    test("intersect '::' + cell gives only card slot cell nodes", () => {
        const env = primitive_env("q1c-env")
        add_card("q1c")
        build_card(env)("q1c")
        execute_all_tasks_sequential(() => {})

        const graph = trace_and_get(internal_cell_this(get_card("q1c")), "q1c-g")

        const card_nodes  = subgraph_by_namespace(graph, "::")
        const cell_nodes  = subgraph_by_kind(graph, "cell")
        const card_cells  = intersect_graphs(card_nodes, cell_nodes)

        // every node must be both a cell and "::" namespaced (slot cells)
        card_cells.forEachNode((_, attrs) => {
            expect(attrs.kind).toBe("cell")
            expect(String(attrs.namespace ?? "").startsWith("::")).toBe(true)
        })
    })
})

// ── Q2: primitive graph without accessor indirection ─────────────────────────

describe("Q2: collapse_accessor_paths on a compiled lain-lang program", () => {
    test("compiled (+ 1 2 out) graph contains Core|accessor nodes", () => {
        const env = primitive_env("q2a-env")
        run("(+ 1 2 out)", env)
        execute_all_tasks_sequential(() => {})

        const envMap = cell_strongest_base_value(env) as Map<string, Cell<any>>
        const out = envMap.get("out")!
        expect(out).toBeDefined()

        const graph = trace_and_get(out, "q2a-g")
        expect(graph.order).toBeGreaterThan(0)

        const accessor_nodes = graph.nodes().filter(id =>
            String(graph.getNodeAttribute(id, "label") ?? "").startsWith("Core|accessor")
        )
        expect(accessor_nodes.length).toBeGreaterThan(0)
    })

    test("after collapse, no Core|accessor nodes remain", () => {
        const env = primitive_env("q2b-env")
        run("(+ 1 2 out)", env)
        execute_all_tasks_sequential(() => {})

        const envMap = cell_strongest_base_value(env) as Map<string, Cell<any>>
        const out = envMap.get("out")!
        const graph = trace_and_get(out, "q2b-g")

        const collapsed = collapse_accessor_paths(graph)

        collapsed.forEachNode((_, attrs) => {
            expect(String(attrs.label ?? "").startsWith("Core|accessor")).toBe(false)
        })
    })

    test("collapsed graph still connects non-accessor source to output", () => {
        const env = primitive_env("q2c-env")
        run("(+ 1 2 out)", env)
        execute_all_tasks_sequential(() => {})

        const envMap = cell_strongest_base_value(env) as Map<string, Cell<any>>
        const out = envMap.get("out")!
        const graph = trace_and_get(out, "q2c-g")
        const collapsed = collapse_accessor_paths(graph)

        // output cell should still be present in collapsed graph
        expect(collapsed.hasNode(cell_id(out))).toBe(true)
        // collapsed graph has edges (connectivity preserved)
        expect(collapsed.size).toBeGreaterThan(0)
    })

    test("collapsed graph is smaller than raw (accessor nodes removed)", () => {
        const env = primitive_env("q2d-env")
        run("(+ 1 2 out)", env)
        execute_all_tasks_sequential(() => {})

        const envMap = cell_strongest_base_value(env) as Map<string, Cell<any>>
        const out = envMap.get("out")!
        const graph = trace_and_get(out, "q2d-g")
        const collapsed = collapse_accessor_paths(graph)

        expect(collapsed.order).toBeLessThan(graph.order)
    })
})

// ── Q3: call graph — propagator subgraph + level filter ──────────────────────

describe("Q3: propagator kind + level filter on compiled card", () => {
    test("subgraph_by_kind propagator contains only propagator nodes", () => {
        const env = primitive_env("q3-env")
        add_card("q3")
        build_card(env)("q3")
        execute_all_tasks_sequential(() => {})

        const graph = trace_and_get(internal_cell_this(get_card("q3")), "q3-g")
        const props  = subgraph_by_kind(graph, "propagator")

        expect(props.order).toBeGreaterThan(0)
        props.forEachNode((_, attrs) => {
            expect(attrs.kind).toBe("propagator")
        })
    })

    test("subgraph_by_level returns nodes at that exact level", () => {
        const env = primitive_env("q3b-env")
        add_card("q3b")
        build_card(env)("q3b")
        execute_all_tasks_sequential(() => {})

        const graph = trace_and_get(internal_cell_this(get_card("q3b")), "q3b-g")

        // collect all levels that exist in the graph
        const levels = new Set<number>()
        graph.forEachNode((_, attrs) => {
            if (typeof attrs.relationLevel === "number") levels.add(attrs.relationLevel)
        })
        expect(levels.size).toBeGreaterThan(0)

        // for each level, subgraph_by_level should only return nodes at that level
        for (const level of levels) {
            const sg = subgraph_by_level(graph, level)
            sg.forEachNode((_, attrs) => {
                expect(attrs.relationLevel).toBe(level)
            })
        }
    })
})

// ── Q4: card upstream + downstream ───────────────────────────────────────────

describe("Q4: union of upstream and downstream on connected cards", () => {
    test("union covers more nodes than either direction alone", () => {
        const env = primitive_env("q4-env")
        add_card("q4a")
        add_card("q4b")
        build_card(env)("q4a")
        build_card(env)("q4b")
        connect_cards("q4a", "q4b", slot_right, slot_left)
        execute_all_tasks_sequential(() => {})

        const mid = internal_cell_right(get_card("q4a"))

        const g_up   = construct_cell("q4-up")
        const g_down = construct_cell("q4-down")
        trace_upstream(mid, g_up)
        trace_downstream(mid, g_down)
        execute_all_tasks_sequential(() => {})

        const up   = cell_strongest_base_value(g_up)   as DirectedGraph
        const down = cell_strongest_base_value(g_down) as DirectedGraph

        expect(up.order).toBeGreaterThan(0)
        expect(down.order).toBeGreaterThan(0)

        const full = union_graphs(up, down)
        // union has at least as many nodes as either side
        expect(full.order).toBeGreaterThanOrEqual(Math.max(up.order, down.order))
        // the mid cell appears in the union
        expect(full.hasNode(cell_id(mid))).toBe(true)
    })

    test("intersection of upstream and downstream contains the boundary cell", () => {
        const env = primitive_env("q4b-env")
        add_card("q4ba")
        add_card("q4bb")
        build_card(env)("q4ba")
        build_card(env)("q4bb")
        connect_cards("q4ba", "q4bb", slot_right, slot_left)
        execute_all_tasks_sequential(() => {})

        const boundary = internal_cell_right(get_card("q4ba"))

        const g_up   = construct_cell("q4b-up")
        const g_down = construct_cell("q4b-down")
        trace_upstream(boundary, g_up)
        trace_downstream(boundary, g_down)
        execute_all_tasks_sequential(() => {})

        const up   = cell_strongest_base_value(g_up)   as DirectedGraph
        const down = cell_strongest_base_value(g_down) as DirectedGraph
        const both = intersect_graphs(up, down)

        // the boundary cell is reachable from both directions
        expect(both.hasNode(cell_id(boundary))).toBe(true)
    })
})

// ── Q5: display values ────────────────────────────────────────────────────────

describe("Q5: value attribute on cell nodes after update_card", () => {
    test("traced card cell has value attr after update_card writes a value", () => {
        const env = primitive_env("q5-env")
        add_card("q5")
        build_card(env)("q5")
        const card = get_card("q5")
        execute_all_tasks_sequential(() => {})

        // Write a plain value (not a program) to the ::this cell
        update_cell(internal_cell_this(card), 99)
        execute_all_tasks_sequential(() => {})

        const graph = trace_and_get(internal_cell_this(card), "q5-g")

        // find the ::this cell node and verify its value attribute
        const this_id = cell_id(internal_cell_this(card))
        expect(graph.hasNode(this_id)).toBe(true)
        expect(graph.getNodeAttribute(this_id, "value")).toBe("99")
    })

    test("all cell nodes with values have the value attr set", () => {
        const env = primitive_env("q5b-env")
        run("(+ 1 2 out)", env)
        execute_all_tasks_sequential(() => {})

        const envMap = cell_strongest_base_value(env) as Map<string, Cell<any>>
        const out = envMap.get("out")!
        const graph = trace_and_get(out, "q5b-g")

        // `out` cell should have value "3" after (+ 1 2)
        const out_id = cell_id(out)
        const val = graph.getNodeAttribute(out_id, "value")
        expect(val).toBe("3")
    })
})

// ── Q6: annotate cell content ─────────────────────────────────────────────────

describe("Q6: annotate_cell_content on compiled network", () => {
    test("adds content attr to every cell node in traced graph", () => {
        const env = primitive_env("q6-env")
        add_card("q6")
        build_card(env)("q6")
        execute_all_tasks_sequential(() => {})

        const graph     = trace_and_get(internal_cell_this(get_card("q6")), "q6-g")
        const annotated = annotate_cell_content(graph)

        let cell_count = 0
        annotated.forEachNode((_, attrs) => {
            if (attrs.kind === "cell") {
                cell_count++
                expect(attrs.content).toBeDefined()
                expect(typeof attrs.content).toBe("string")
            }
        })
        expect(cell_count).toBeGreaterThan(0)
    })

    test("annotate_cell_content does not add content to propagator nodes", () => {
        const env = primitive_env("q6b-env")
        run("(+ 1 2 out)", env)
        execute_all_tasks_sequential(() => {})

        const envMap = cell_strongest_base_value(env) as Map<string, Cell<any>>
        const out = envMap.get("out")!
        const graph     = trace_and_get(out, "q6b-g")
        const annotated = annotate_cell_content(graph)

        annotated.forEachNode((_, attrs) => {
            if (attrs.kind === "propagator") {
                expect(attrs.content).toBeUndefined()
            }
        })
    })

    test("opt-in predicate limits content annotation to one cell", () => {
        const env = primitive_env("q6c-env")
        run("(+ 1 2 out)", env)
        execute_all_tasks_sequential(() => {})

        const envMap = cell_strongest_base_value(env) as Map<string, Cell<any>>
        const out = envMap.get("out")!
        const out_id = cell_id(out)
        const graph = trace_and_get(out, "q6c-g")

        const annotated = annotate_cell_content(graph, (_, id) => id === out_id)

        expect(annotated.getNodeAttribute(out_id, "content")).toBeDefined()

        // all other nodes must not have content
        annotated.forEachNode((id, attrs) => {
            if (id !== out_id) {
                expect(attrs.content).toBeUndefined()
            }
        })
    })
})

// ── Card-embedded graph query programs (Q1–Q6 via stdlib) ─────────────────────
//
// TODO list — essential questions from docs/propagation-tracing.md to answer
// via lain-lang programs building graph combinators inside cards:
//
//   Q1: All network for a card
//       (graph:dependents <root> g) → (graph:namespace g "::" g-card)
//       Root must be the actual slot cell (injected from TypeScript), because
//       ::this inside a card resolves to "Core|accessor|::this" (namespace "Core"),
//       not the "::" slot cell.
//
//   Q2: Primitive graph without accessor indirection
//       (graph:dependents <out> g) → (graph:collapse-accessors g g-clean)
//       Works end-to-end via run() since out is in the env by name.
//
//   Q3: Call graph of primitive propagators at a given relation level
//       (graph:dependents <root> g) → (graph:kind g "propagator" g-props)
//                                   → (graph:at-level g-props <n> g-level)
//       Two chained run() calls on the same env.
//
//   Q4: Card upstream + downstream union
//       Boundary cell injected into env from TypeScript; then:
//       (graph:dependents bnd g-up) (graph:downstream bnd g-down)
//       (graph:union g-up g-down g-full)
//       All three run() calls on the same env.
//
//   Q5: Display values of cells in traced graph
//       Value attr is populated by node_attrs() during traversal.
//       Verified via the TypeScript Q5 tests above; no extra run() needed.
//
//   Q6: Inspect full cell content in traced graph
//       (graph:dependents <root> g) → (graph:annotate-content g g-rich)
//       Two chained run() calls.
//
// Pattern: primitive_env() → run() or update_cell(thisCell, program)
//          → execute_all_tasks_sequential → read result from envMap.
// All graph combinator primitives are registered in compiler/primitive/stdlib.ts.
// graph:dependents and graph:downstream now use trace_upstream_once /
// trace_downstream_once (non-reactive) to prevent the dead loop that the
// reactive trace() variant caused when gatherer cells are connected to the env
// via selective_sync.

describe("Q1 card-embedded: namespace filter inside a card via stdlib", () => {
    // Key insight: any variable reference in a lain-lang program (e.g. ::this, ce-q1-slot)
    // is resolved via ce_cached_lexical_lookup, which creates a "Core|accessor|<name>" cell.
    // Tracing from that accessor cell yields a "Core" namespace subgraph, NOT "::" slot cells.
    //
    // The "::" namespace filter (on actual slot cells) is demonstrated by the TypeScript Q1
    // tests above, which pass internal_cell_this() directly to trace_upstream().
    //
    // Card-embedded Q1: demonstrate graph:namespace on the "Core" accessor network
    // produced when tracing from a card-embedded variable reference.

    test("(graph:dependents ::this g) → (graph:namespace g 'Core' g-core): accessor nodes visible", () => {
        const env = primitive_env("ce-q1-env")
        add_card("ce-q1")
        build_card(env)("ce-q1")
        const card = guarantee_get_card_metadata("ce-q1").card
        const thisCell = internal_cell_this(card)

        // Run graph:dependents from ::this inside the card program.
        // ::this resolves to "Core|accessor|::this" — trace starts from there.
        update_cell(thisCell, "(graph:dependents ::this ce-q1-raw)")
        execute_all_tasks_sequential(() => {})

        // Apply graph:namespace to filter to "Core" accessor nodes
        run("(graph:namespace ce-q1-raw \"Core\" ce-q1-core)", env)
        execute_all_tasks_sequential(() => {})

        const envMap = cell_strongest_base_value(env) as Map<string, Cell<any>>

        const raw = cell_strongest_base_value(envMap.get("ce-q1-raw")!) as DirectedGraph
        expect(raw.order).toBeGreaterThan(0)

        const core_graph = cell_strongest_base_value(envMap.get("ce-q1-core")!) as DirectedGraph
        expect(core_graph.order).toBeGreaterThan(0)
        core_graph.forEachNode((_, attrs) => {
            expect(String(attrs.namespace ?? "").startsWith("Core")).toBe(true)
        })
    })

    test("card-embedded ::this trace is accessor-rooted and does not include slot namespace nodes", () => {
        // In card-embedded runs, ::this is resolved through Core accessor cells.
        // The resulting graph is rooted in Core namespace and does not guarantee "::" slot nodes.
        const env = primitive_env("ce-q1b-env")
        add_card("ce-q1b")
        build_card(env)("ce-q1b")
        const card = guarantee_get_card_metadata("ce-q1b").card
        const thisCell = internal_cell_this(card)

        update_cell(thisCell, "(graph:dependents ::this ce-q1b-raw)")
        execute_all_tasks_sequential(() => {})

        const envMap = cell_strongest_base_value(env) as Map<string, Cell<any>>
        const ce_raw = cell_strongest_base_value(envMap.get("ce-q1b-raw")!) as DirectedGraph
        expect(ce_raw.order).toBeGreaterThan(0)

        const core_nodes = ce_raw.nodes().filter(id =>
            String(ce_raw.getNodeAttribute(id, "namespace") ?? "").startsWith("Core")
        )
        const slot_nodes = ce_raw.nodes().filter(id =>
            String(ce_raw.getNodeAttribute(id, "namespace") ?? "").startsWith("::")
        )
        // accessor namespace must be present
        expect(core_nodes.length).toBeGreaterThan(0)
        // slot namespace is not expected from accessor-rooted traces
        expect(slot_nodes.length).toBe(0)
    })
})

describe("Q2 card-embedded: collapse accessor paths via stdlib", () => {
    test("(graph:dependents out g) → (graph:collapse-accessors g clean): no accessor nodes remain", () => {
        const env = primitive_env("ce-q2-env")
        run("(+ 1 2 ce-q2-out)", env)
        execute_all_tasks_sequential(() => {})

        run("(graph:dependents ce-q2-out ce-q2-raw)", env)
        execute_all_tasks_sequential(() => {})
        run("(graph:collapse-accessors ce-q2-raw ce-q2-clean)", env)
        execute_all_tasks_sequential(() => {})

        const envMap = cell_strongest_base_value(env) as Map<string, Cell<any>>
        const clean_cell = envMap.get("ce-q2-clean")!
        expect(clean_cell).toBeDefined()
        const clean = cell_strongest_base_value(clean_cell) as DirectedGraph

        // No "Core|accessor" nodes in collapsed graph
        clean.forEachNode((_, attrs) => {
            expect(String(attrs.label ?? "").startsWith("Core|accessor")).toBe(false)
        })
        // Collapse keeps a connected non-empty graph even after accessor removal
        expect(clean.order).toBeGreaterThan(0)
        expect(clean.size).toBeGreaterThan(0)
    })

    test("collapsed graph is smaller than raw graph (accessor nodes removed)", () => {
        const env = primitive_env("ce-q2b-env")
        run("(+ 1 2 ce-q2b-out)", env)
        execute_all_tasks_sequential(() => {})

        run("(graph:dependents ce-q2b-out ce-q2b-raw)", env)
        execute_all_tasks_sequential(() => {})
        run("(graph:collapse-accessors ce-q2b-raw ce-q2b-clean)", env)
        execute_all_tasks_sequential(() => {})

        const envMap = cell_strongest_base_value(env) as Map<string, Cell<any>>
        const raw   = cell_strongest_base_value(envMap.get("ce-q2b-raw")!)   as DirectedGraph
        const clean = cell_strongest_base_value(envMap.get("ce-q2b-clean")!) as DirectedGraph
        expect(clean.order).toBeLessThan(raw.order)
    })
})

describe("Q3 card-embedded: call graph of primitive propagators via stdlib", () => {
    test("(graph:dependents root g) → (graph:kind g 'propagator' g-props): only propagators", () => {
        const env = primitive_env("ce-q3-env")
        run("(+ 1 2 ce-q3-out)", env)
        execute_all_tasks_sequential(() => {})

        run("(graph:dependents ce-q3-out ce-q3-raw)", env)
        execute_all_tasks_sequential(() => {})
        run("(graph:kind ce-q3-raw \"propagator\" ce-q3-props)", env)
        execute_all_tasks_sequential(() => {})

        const envMap = cell_strongest_base_value(env) as Map<string, Cell<any>>
        const props_cell = envMap.get("ce-q3-props")!
        expect(props_cell).toBeDefined()
        const props = cell_strongest_base_value(props_cell) as DirectedGraph
        expect(props.order).toBeGreaterThan(0)
        props.forEachNode((_, attrs) => {
            expect(attrs.kind).toBe("propagator")
        })
    })

    test("(graph:kind g 'cell' g-cells) → (graph:at-level g-cells <level> g-level): one level only", () => {
        const env = primitive_env("ce-q3b-env")
        run("(+ 1 2 ce-q3b-out)", env)
        execute_all_tasks_sequential(() => {})

        run("(graph:dependents ce-q3b-out ce-q3b-raw)", env)
        execute_all_tasks_sequential(() => {})
        run("(graph:kind ce-q3b-raw \"cell\" ce-q3b-cells)", env)
        execute_all_tasks_sequential(() => {})

        const envMap = cell_strongest_base_value(env) as Map<string, Cell<any>>
        const cells_graph = cell_strongest_base_value(envMap.get("ce-q3b-cells")!) as DirectedGraph

        // collect all levels in cell subgraph
        const levels = new Set<number>()
        cells_graph.forEachNode((_, attrs) => {
            if (typeof attrs.relationLevel === "number") levels.add(attrs.relationLevel)
        })
        expect(levels.size).toBeGreaterThan(0)

        // pick one level and verify graph:at-level via run()
        const target_level = [...levels][0]!
        const level_cell_name = `ce-q3b-level${target_level}`

        // graph:at-level takes the graph cell and a number cell
        // We pass a constant number — compile it as an immediate
        run(`(graph:at-level ce-q3b-cells ${target_level} ${level_cell_name})`, env)
        execute_all_tasks_sequential(() => {})

        const envMap3 = cell_strongest_base_value(env) as Map<string, Cell<any>>
        const level_cell = envMap3.get(level_cell_name)!
        expect(level_cell).toBeDefined()
        const level_graph = cell_strongest_base_value(level_cell) as DirectedGraph
        level_graph.forEachNode((_, attrs) => {
            expect(attrs.relationLevel).toBe(target_level)
        })
    })
})

describe("Q4 card-embedded: upstream+downstream union via stdlib", () => {
    // Tracing in lain-lang goes through accessor cells (see Q1 note). For Q4,
    // we obtain upstream + downstream graphs via TypeScript trace_upstream/downstream
    // (which start from the real boundary cell), inject them into the env as named
    // cells, then call graph:union via run() to demonstrate the stdlib combinator.
    test("TypeScript-traced up+down → inject into env → (graph:union up down full) via stdlib", () => {
        const env = primitive_env("ce-q4-env")
        add_card("ce-q4a")
        add_card("ce-q4b")
        build_card(env)("ce-q4a")
        build_card(env)("ce-q4b")
        connect_cards("ce-q4a", "ce-q4b", slot_right, slot_left)
        execute_all_tasks_sequential(() => {})

        const boundary = internal_cell_right(guarantee_get_card_metadata("ce-q4a").card)

        // Trace from the real boundary cell using TypeScript
        const g_up   = construct_cell("ce-q4-up-ts")
        const g_down = construct_cell("ce-q4-down-ts")
        trace_upstream(boundary, g_up)
        trace_downstream(boundary, g_down)
        execute_all_tasks_sequential(() => {})

        const up   = cell_strongest_base_value(g_up)   as DirectedGraph
        const down = cell_strongest_base_value(g_down) as DirectedGraph
        expect(up.order).toBeGreaterThan(0)

        // Inject up/down graph cells into the env so stdlib can reference them
        const up_cell   = construct_cell("ce-q4-up")
        const down_cell = construct_cell("ce-q4-down")
        update_cell(up_cell,   up)
        update_cell(down_cell, down)
        const envMap = cell_strongest_base_value(env) as Map<string, Cell<any>>
        envMap.set("ce-q4-up",   up_cell)
        envMap.set("ce-q4-down", down_cell)

        // Q4: demonstrate graph:union via stdlib
        run("(graph:union ce-q4-up ce-q4-down ce-q4-full)", env)
        execute_all_tasks_sequential(() => {})

        const envMap2 = cell_strongest_base_value(env) as Map<string, Cell<any>>
        const full = cell_strongest_base_value(envMap2.get("ce-q4-full")!) as DirectedGraph
        expect(full.order).toBeGreaterThanOrEqual(Math.max(up.order, down.order))
        expect(full.hasNode(cell_id(boundary))).toBe(true)
    })
})

describe("Q6 card-embedded: annotate-content via stdlib", () => {
    test("(graph:dependents root g) → (graph:annotate-content g rich): cells have content attr", () => {
        const env = primitive_env("ce-q6-env")
        run("(+ 1 2 ce-q6-out)", env)
        execute_all_tasks_sequential(() => {})

        run("(graph:dependents ce-q6-out ce-q6-raw)", env)
        execute_all_tasks_sequential(() => {})
        run("(graph:annotate-content ce-q6-raw ce-q6-rich)", env)
        execute_all_tasks_sequential(() => {})

        const envMap = cell_strongest_base_value(env) as Map<string, Cell<any>>
        const rich_cell = envMap.get("ce-q6-rich")!
        expect(rich_cell).toBeDefined()
        const rich = cell_strongest_base_value(rich_cell) as DirectedGraph

        let cell_count = 0
        rich.forEachNode((_, attrs) => {
            if (attrs.kind === "cell") {
                cell_count++
                expect(attrs.content).toBeDefined()
                expect(typeof attrs.content).toBe("string")
            }
        })
        expect(cell_count).toBeGreaterThan(0)

        // propagator nodes must NOT have content
        rich.forEachNode((_, attrs) => {
            if (attrs.kind === "propagator") {
                expect(attrs.content).toBeUndefined()
            }
        })
    })

    test("graph:namespace + graph:annotate-content: card cells annotated, non-card cells untouched", () => {
        const env = primitive_env("ce-q6b-env")
        add_card("ce-q6b")
        build_card(env)("ce-q6b")
        execute_all_tasks_sequential(() => {})

        const thisCell = internal_cell_this(guarantee_get_card_metadata("ce-q6b").card)
        const envMap = cell_strongest_base_value(env) as Map<string, Cell<any>>
        envMap.set("ce-q6b-slot", thisCell)

        run("(graph:dependents ce-q6b-slot ce-q6b-raw)", env)
        execute_all_tasks_sequential(() => {})
        run("(graph:namespace ce-q6b-raw \"::\" ce-q6b-card)", env)
        execute_all_tasks_sequential(() => {})
        run("(graph:annotate-content ce-q6b-card ce-q6b-rich)", env)
        execute_all_tasks_sequential(() => {})

        const envMap2 = cell_strongest_base_value(env) as Map<string, Cell<any>>
        const rich_cell = envMap2.get("ce-q6b-rich")!
        expect(rich_cell).toBeDefined()
        const rich = cell_strongest_base_value(rich_cell) as DirectedGraph

        // Every cell in the "::" namespace-filtered graph must have content
        rich.forEachNode((_, attrs) => {
            if (attrs.kind === "cell") {
                expect(attrs.content).toBeDefined()
            }
        })
    })
})

describe("trace_periodic behavior", () => {
    test("first rebuild is synchronous on initial fire", () => {
        const env = primitive_env("tp-sync-env")
        add_card("tp-sync")
        build_card(env)("tp-sync")
        execute_all_tasks_sequential(() => {})

        const root = internal_cell_this(get_card("tp-sync"))
        const gatherer = construct_cell("tp-sync-gatherer")
        const trace_upstream_fast = trace_periodic(get_dependents, 25)

        trace_upstream_fast(root, gatherer)
        execute_all_tasks_sequential(() => {})

        const graph = cell_strongest_base_value(gatherer) as DirectedGraph
        expect(graph).toBeDefined()
        expect(graph.order).toBeGreaterThan(0)
        expect(graph.hasNode(cell_id(root))).toBe(true)
    })

    test("rebuilds on interval and picks up topology changes", async () => {
        const env = primitive_env("tp-interval-env")
        add_card("tp-a")
        add_card("tp-b")
        build_card(env)("tp-a")
        build_card(env)("tp-b")
        execute_all_tasks_sequential(() => {})

        const root = internal_cell_right(get_card("tp-a"))
        const gatherer = construct_cell("tp-interval-gatherer")
        const trace_upstream_fast = trace_periodic(get_dependents, 25)
        trace_upstream_fast(root, gatherer)
        execute_all_tasks_sequential(() => {})

        const before = cell_strongest_base_value(gatherer) as DirectedGraph
        expect(before.order).toBeGreaterThan(0)

        // Change graph topology after tracer attachment.
        connect_cards("tp-a", "tp-b", slot_right, slot_left)
        execute_all_tasks_sequential(() => {})

        await wait(80)
        execute_all_tasks_sequential(() => {})

        const after = cell_strongest_base_value(gatherer) as DirectedGraph
        expect(after.order).toBeGreaterThan(before.order)
    })

    test("stale interval from old system does not keep mutating after reset", async () => {
        const env = primitive_env("tp-reset-env")
        add_card("tp-reset")
        build_card(env)("tp-reset")
        execute_all_tasks_sequential(() => {})

        const root = internal_cell_this(get_card("tp-reset"))
        const gatherer = construct_cell("tp-reset-gatherer")
        const trace_upstream_fast = trace_periodic(get_dependents, 25)
        trace_upstream_fast(root, gatherer)
        execute_all_tasks_sequential(() => {})

        const beforeReset = cell_strongest_base_value(gatherer) as DirectedGraph
        expect(beforeReset.order).toBeGreaterThan(0)

        init_system()
        clear_card_metadata()
        await wait(80)

        const afterReset = cell_strongest_base_value(gatherer) as DirectedGraph
        // old tracer must not keep rewriting with a different graph after system reset
        expect(afterReset.order).toBe(beforeReset.order)
    })
})
