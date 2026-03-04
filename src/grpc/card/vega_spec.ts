/**
 * Pure helpers to build Vega-Lite or Vega spec objects for card display.
 * Backend uses these to set cell base value; frontend renders with vega-embed.
 * No vega/vega-lite runtime dependency here—only JSON-serializable objects.
 *
 * ## Vega-object contract (backend ↔ frontend)
 *
 * For the frontend to render a spec with vega-embed (instead of editable text),
 * the spec must be explicitly marked. Include one of:
 *
 * - `header: 'vega-object'` (preferred)
 * - `@type: 'vega'` or `'vega-lite'`
 *
 * along with a `$schema` containing `"vega-lite"` or `"vega"`.
 * Specs with `$schema` but no header are treated as plain data → editable text.
 */

/** Minimal Vega-Lite v5 spec shape (enough for $schema detection and rendering). */
export type VegaLiteSpec = {
  $schema: string
  [key: string]: unknown
}

/** Node with position for graph specs. */
export type GraphNode = { id: string; label: string; x: number; y: number }

/** Link between nodes. */
export type GraphLink = { source: string; target: string }

const VEGA_LITE_SCHEMA = "https://vega.github.io/schema/vega-lite/v5.json"
const VEGA_SCHEMA = "https://vega.github.io/schema/vega/v5.json"

/**
 * Header value that marks a spec as a vega-object.
 * Frontend (lain-viz) uses this to decide: render with vega-embed vs editable text.
 */
const VEGA_OBJECT_HEADER = "vega-object"

/**
 * Returns a minimal Vega-Lite point chart spec (for testing or simple data).
 * Caller can extend with data, encoding, etc.
 * Includes header so frontend renders with vega-embed.
 */
export function minimal_vega_lite_spec(overrides: Partial<VegaLiteSpec> = {}): VegaLiteSpec {
  return {
    header: VEGA_OBJECT_HEADER,
    $schema: VEGA_LITE_SCHEMA,
    description: "Minimal Vega-Lite spec from backend",
    data: { values: [] },
    mark: "point",
    encoding: {},
    ...overrides,
  }
}

/**
 * Returns a Vega-Lite spec that plots nodes as points using precomputed x,y.
 * Links are not drawn (Vega-Lite has no native link mark); use vega_spec_from_graph
 * for full force-directed graph with edges.
 */
export function vega_lite_spec_from_graph(
  nodes: readonly GraphNode[],
  _links: readonly GraphLink[]
): VegaLiteSpec {
  const values = nodes.map((n) => ({ id: n.id, label: n.label, x: n.x, y: n.y }))
  return {
    header: VEGA_OBJECT_HEADER,
    $schema: VEGA_LITE_SCHEMA,
    description: "Graph nodes as points",
    data: { values },
    mark: "point",
    encoding: {
      x: { field: "x", type: "quantitative" },
      y: { field: "y", type: "quantitative" },
      tooltip: [{ field: "label", type: "nominal" }, { field: "id", type: "nominal" }],
    },
  }
}

/** Vega v5 spec shape (for force-directed and other Vega-only features). */
export type VegaSpec = {
  $schema: string
  [key: string]: unknown
}

/**
 * Returns a Vega spec with force-directed layout, nodes as symbols, links as paths.
 * Uses Vega's force transform and linkpath. See:
 * https://vega.github.io/vega/examples/force-directed-layout/
 */
export function vega_spec_from_graph(
  nodes: readonly GraphNode[],
  links: readonly GraphLink[]
): VegaSpec {
  const nodeValues = nodes.map((n) => ({ id: n.id, label: n.label }))
  const linkValues = links.map((l) => ({ source: l.source, target: l.target }))
  return {
    header: VEGA_OBJECT_HEADER,
    $schema: VEGA_SCHEMA,
    description: "Force-directed graph",
    width: 400,
    height: 300,
    padding: 0,
    autosize: "none",
    data: [
      { name: "node-data", values: nodeValues },
      { name: "link-data", values: linkValues },
    ],
    marks: [
      {
        type: "path",
        from: { data: "link-data" },
        interactive: false,
        encode: {
          update: { stroke: { value: "#ccc" }, strokeWidth: { value: 1 } },
        },
        transform: [
          {
            type: "linkpath",
            shape: "line",
            sourceX: "datum.source.x",
            sourceY: "datum.source.y",
            targetX: "datum.target.x",
            targetY: "datum.target.y",
          },
        ],
      },
      {
        name: "nodes",
        type: "symbol",
        zindex: 1,
        from: { data: "node-data" },
        encode: {
          enter: { fill: { value: "#4fc3f7" }, stroke: { value: "white" } },
          update: { size: { value: 256 }, cursor: { value: "pointer" } },
        },
        transform: [
          {
            type: "force",
            static: true,
            iterations: 300,
            forces: [
              { force: "center", x: { signal: "width / 2" }, y: { signal: "height / 2" } },
              { force: "collide", radius: 8 },
              { force: "nbody", strength: -30 },
              {
                force: "link",
                links: "link-data",
                id: { expr: "datum.id" },
                distance: 30,
              },
            ],
          },
        ],
      },
    ],
  }
}
