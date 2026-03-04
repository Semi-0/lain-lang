/**
 * Unit tests for graphology serialization: predicate, encoder, base_serializer handler.
 */
import { describe, test, expect } from "bun:test"
import { base_serializer } from "sando-layer/Basic/LayeredSerializer"
import {
  is_graphology_graph,
  graphology_graph_to_graph_data,
  load_graphology_serializer,
} from "./session_encode"

function mock_graphology_like(nodes: { id: string; label?: string }[], links: { source: string; target: string }[]) {
  return {
    forEachNode: (fn: (node: string, attrs: { label?: string }) => void) => {
      for (const n of nodes) fn(n.id, { label: n.label })
    },
    forEachEdge: (fn: (_e: string, _a: unknown, source: string, target: string) => void) => {
      for (const l of links) fn("", undefined, l.source, l.target)
    },
  }
}

describe("is_graphology_graph", () => {
  test("returns true for object with forEachNode and forEachEdge", () => {
    const g = mock_graphology_like([{ id: "a" }], [])
    expect(is_graphology_graph(g)).toBe(true)
  })

  test("returns false for null", () => {
    expect(is_graphology_graph(null)).toBe(false)
  })

  test("returns false for plain object without forEachNode", () => {
    expect(is_graphology_graph({ forEachEdge: () => {} })).toBe(false)
  })

  test("returns false for plain object without forEachEdge", () => {
    expect(is_graphology_graph({ forEachNode: () => {} })).toBe(false)
  })

  test("returns false for array", () => {
    expect(is_graphology_graph([])).toBe(false)
  })
})

describe("graphology_graph_to_graph_data", () => {
  test("converts minimal graph to GraphData", () => {
    const g = mock_graphology_like([{ id: "a", label: "A" }, { id: "b" }], [{ source: "a", target: "b" }])
    const result = graphology_graph_to_graph_data(g)
    expect(result.nodes).toHaveLength(2)
    expect(result.nodes.find((n) => n.id === "a")).toEqual({ id: "a", label: "A" })
    expect(result.nodes.find((n) => n.id === "b")?.label).toBe("b")
    expect(result.links).toEqual([{ source: "a", target: "b" }])
  })

  test("defaults label to id when absent", () => {
    const g = mock_graphology_like([{ id: "x" }], [])
    const result = graphology_graph_to_graph_data(g)
    expect(result.nodes[0]).toEqual({ id: "x", label: "x" })
  })
})

describe("base_serializer with graphology handler", () => {
  test("base_serializer returns GraphData after load_graphology_serializer", () => {
    load_graphology_serializer()
    const g = mock_graphology_like([{ id: "n1", label: "Node1" }], [])
    const result = base_serializer(g)
    expect(result).toEqual({ nodes: [{ id: "n1", label: "Node1" }], links: [] })
  })

  test("base_serializer still passes through non-graphology values", () => {
    load_graphology_serializer()
    expect(base_serializer(42)).toBe(42)
    expect(base_serializer("hello")).toBe("hello")
    expect(base_serializer({ a: 1 })).toEqual({ a: 1 })
  })
})
