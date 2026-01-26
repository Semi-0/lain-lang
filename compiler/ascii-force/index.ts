export * from "./types";
export { layoutForceGraph } from "./layout";
export { drawAsciiForceGraph, overlayLabels } from "./draw";

import { layoutForceGraph } from "./layout";
import { drawAsciiForceGraph } from "./draw";
import {
  type ForceGraph,
  type RenderOptions,
  type RenderResult,
  type AsciiForceNode,
  type AsciiForceLink,
} from "./types";

export const renderAsciiForceGraph = (
  graph: ForceGraph,
  partialOptions: Partial<RenderOptions> = {},
): RenderResult => {
  const layout = layoutForceGraph(graph, partialOptions);
  return drawAsciiForceGraph(layout);
};

export const buildSampleGraph = (): ForceGraph => {
  const labels = ["eko", "prop", "cell", "hooks", "scheduler", "signals", "ui", "runtime"];
  const nodes: AsciiForceNode[] = labels.map((label, idx) => ({
    id: label,
    label,
    x: Math.cos((idx / labels.length) * Math.PI * 2),
    y: Math.sin((idx / labels.length) * Math.PI * 2),
  }));

  const links: AsciiForceLink[] = [
    { source: "eko", target: "prop" },
    { source: "prop", target: "cell" },
    { source: "cell", target: "hooks" },
    { source: "hooks", target: "scheduler" },
    { source: "scheduler", target: "runtime" },
    { source: "runtime", target: "ui" },
    { source: "ui", target: "signals" },
    { source: "signals", target: "eko" },
    { source: "prop", target: "runtime" },
    { source: "cell", target: "ui" },
  ];

  return { nodes, links };
};

import type { RenderedNode } from "./types";

export const formatLegend = (nodes: ReadonlyArray<RenderedNode>) =>
  nodes
    .map((node) => {
      const { id } = node;
      const label = node.label ?? id;
      const x = node.screenX.toFixed(1);
      const y = node.screenY.toFixed(1);
      return `• ${label.padEnd(10, " ")} @ (${x}, ${y})`;
    })
    .join("\n");


