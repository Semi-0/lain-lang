import { createRequire } from "module";
import type { ForceLayout, RenderResult, RenderedNode } from "./types";
import { ensureNode } from "./types";

const require = createRequire(import.meta.url);
const DrawilleCanvas: DrawilleCanvasCtor = require("drawille-canvas");

type DrawilleCanvasCtor = new (width?: number, height?: number) => DrawilleCanvasInstance;

type DrawilleCanvasInstance = {
  width: number;
  height: number;
  getContext: (type: "2d") => DrawilleRenderingContext;
};

type DrawilleRenderingContext = {
  clearRect: (x: number, y: number, w: number, h: number) => void;
  beginPath: () => void;
  moveTo: (x: number, y: number) => void;
  lineTo: (x: number, y: number) => void;
  stroke: () => void;
  fillRect: (x: number, y: number, w: number, h: number) => void;
  toString: () => string;
};

export const drawAsciiForceGraph = (layout: ForceLayout): RenderResult => {
  const { nodes, links, options } = layout;
  const { width, height, nodeRadius } = options;
  const canvas = new DrawilleCanvas(width, height);
  const context = canvas.getContext("2d");
  context.clearRect(0, 0, width, height);

  links.forEach((link) => {
    const source = ensureNode(link.source as any, nodes);
    const target = ensureNode(link.target as any, nodes);
    const start = nodes.find((node) => node.id === source.id);
    const end = nodes.find((node) => node.id === target.id);
    if (!start || !end) return;
    context.beginPath();
    context.moveTo(start.screenX, start.screenY);
    context.lineTo(end.screenX, end.screenY);
    context.stroke();
  });

  nodes.forEach((node) => {
    const size = nodeRadius * 2 + 1;
    context.fillRect(node.screenX - nodeRadius, node.screenY - nodeRadius, size, size);
  });

  const frameWithLabels = overlayLabels(context.toString(), nodes);

  return {
    frame: frameWithLabels,
    nodes,
    options,
  };
};

export function overlayLabels(frame: string, nodes: RenderedNode[]): string {
  const lines = frame.split("\n");
  if (lines.length === 0) {
    return frame;
  }

  if (lines[lines.length - 1] === "") {
    lines.pop();
  }

  const grid = lines.map((line) => line.split(""));
  const charWidth = grid[0]?.length ?? 0;
  const charHeight = grid.length;
  if (charWidth === 0 || charHeight === 0) {
    return frame;
  }

  nodes.forEach((node) => {
    const label = (node.label ?? node.id).slice(0, 40);
    if (label.length === 0) {
      return;
    }

    // Offset label slightly to the right and below the node to reduce overlap
    const baseCol = Math.round(node.screenX / 2);
    const baseRow = Math.round(node.screenY / 4);
    
    // Try to place label with offset, falling back to original position
    const col = Math.max(0, Math.min(charWidth - label.length, baseCol + 2));
    const row = Math.max(0, Math.min(charHeight - 1, baseRow + 1));

    // Clear space for label by replacing characters
    for (let i = 0; i < label.length; i += 1) {
      const targetCol = col + i;
      if (targetCol < charWidth && row < charHeight && grid[row]) {
        grid[row]![targetCol] = label[i]!;
      }
    }
  });

  return grid.map((chars) => chars.join("")).join("\n");
}


