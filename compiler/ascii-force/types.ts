import {
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";

export type AsciiForceNode = SimulationNodeDatum & {
  id: string;
  label?: string;
};

export type AsciiForceLink = SimulationLinkDatum<AsciiForceNode> & {
  id?: string;
};

export type ForceGraph = {
  nodes: AsciiForceNode[];
  links: AsciiForceLink[];
};

export type RenderOptions = {
  width: number;
  height: number;
  padding: number;
  nodeRadius: number;
  linkDistance: number;
  chargeStrength: number;
  ticks: number;
};

export type RenderedNode = AsciiForceNode & {
  screenX: number;
  screenY: number;
};

export type ForceLayout = {
  nodes: RenderedNode[];
  links: AsciiForceLink[];
  options: RenderOptions;
};

export type RenderResult = {
  frame: string;
  nodes: RenderedNode[];
  options: RenderOptions;
};

export const DEFAULT_RENDER_OPTIONS: RenderOptions = {
  width: 160,
  height: 80,
  padding: 6,
  nodeRadius: 2,
  linkDistance: 30,
  chargeStrength: -100,
  ticks: 200,
};

export const cloneGraph = (graph: ForceGraph): ForceGraph => ({
  nodes: graph.nodes.map((node) => ({ ...node })),
  links: graph.links.map((link) => ({ ...link })),
});

export const ensureNode = (node: AsciiForceNode | string | number, nodes: AsciiForceNode[]): AsciiForceNode => {
  if (typeof node === "object") {
    return node;
  }
  if (typeof node === "number") {
    return nodes[node]!;
  }
  const found = nodes.find((candidate) => candidate.id === node);
  if (!found) {
    throw new Error(`Unable to resolve node "${node}".`);
  }
  return found;
};

export const projectValue = (value: number, min: number, max: number, size: number, padding: number) => {
  if (!Number.isFinite(value)) return padding + size / 2;
  if (max - min < 1e-6) {
    return padding + size / 2;
  }
  return padding + ((value - min) / (max - min)) * size;
};

export const computeBounds = (nodes: AsciiForceNode[]) => {
  const xs = nodes.map((node) => node.x ?? 0);
  const ys = nodes.map((node) => node.y ?? 0);
  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
  };
};





