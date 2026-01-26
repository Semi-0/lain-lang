import {
  forceCenter,
  forceLink,
  forceManyBody,
  forceSimulation,
} from "d3-force";
import {
  DEFAULT_RENDER_OPTIONS,
  cloneGraph,
  computeBounds,
  projectValue,
  type ForceGraph,
  type ForceLayout,
  type RenderOptions,
  type RenderedNode,
} from "./types";
import type { AsciiForceNode, AsciiForceLink } from "./types";

export const layoutForceGraph = (
  graph: ForceGraph,
  partialOptions: Partial<RenderOptions> = {},
): ForceLayout => {
  const options: RenderOptions = { ...DEFAULT_RENDER_OPTIONS, ...partialOptions };
  const { padding, linkDistance, chargeStrength, ticks } = options;
  const { nodes, links } = cloneGraph(graph);

  const simulation = forceSimulation(nodes)
    .force(
      "link",
      forceLink<AsciiForceNode, AsciiForceLink>(links)
        .id((node) => node.id)
        .distance(linkDistance),
    )
    .force("charge", forceManyBody().strength(chargeStrength))
    .force("center", forceCenter(0, 0))
    .stop();

  for (let i = 0; i < ticks; i += 1) {
    simulation.tick();
  }

  const { minX, maxX, minY, maxY } = computeBounds(nodes);
  const innerWidth = Math.max(2, options.width - padding * 2);
  const innerHeight = Math.max(2, options.height - padding * 2);

  const projectedNodes: RenderedNode[] = nodes.map((node) => {
    const rawX = node.x ?? 0;
    const rawY = node.y ?? 0;
    const screenX = projectValue(rawX, minX, maxX, innerWidth, padding);
    const screenY = projectValue(rawY, minY, maxY, innerHeight, padding);
    return { ...node, screenX, screenY };
  });

  return {
    nodes: projectedNodes,
    links,
    options,
  };
};


