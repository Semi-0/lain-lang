/**
 * Cell Naming Module
 *
 * Unified naming convention for cells and propagators across the tracer graph,
 * compiler, and card API. Uses pipe-separated parts for structured identifiers.
 *
 * @see docs/cell-naming.md
 */
import type { Cell } from "ppropogator";
import { cell_name } from "ppropogator/Cell/Cell";
import type { Propagator } from "ppropogator";
import { propagator_name } from "ppropogator";

/** Separator for multi-part names. */
export const SEP = "|";

export const card_header = "CARD";
/** Join parts with SEP. */
export const make_name = (parts: string[]): string => parts.join(SEP);

/** Headers for node types in the traced graph. */
export const CELL_HEADER = "CELL";
export const PROPAGATOR_HEADER = "PROPAGATOR";
export const CARD_HEADER = "CARD";

/**
 * Create label for a cell node in the tracer graph.
 * Format: CELL|{cell_name}
 */
export const create_cell_label = (cell: Cell<any>, _opts?: { cardId?: string }): string =>
  make_name([CELL_HEADER, cell_name(cell)]);

/**
 * Create label for a propagator node in the tracer graph.
 * Format: PROPAGATOR|{propagator_name}
 */
export const create_propagator_label = (p: Propagator): string =>
  make_name([PROPAGATOR_HEADER, propagator_name(p)]);

/**
 * Core cell naming (compiler-generated cells).
 * Accessor cells: Core|accessor|{key}
 */
export const core_accessor_name = (key: string): string =>
  make_name(["Core", "accessor", key]);

/**
 * Core cell naming for constants.
 * Format: Core|Constant
 */
export const core_constant_name = (): string => make_name(["Core", "Constant"]);

/**
 * Core cell naming for a constant with a specific value (for uniqueness).
 * Format: Core|Constant|{value}
 */
export const core_constant_value_name = (value: unknown): string =>
  make_name(["Core", "Constant", String(value)]);

/**
 * Core cell naming for env/lexical binding cells.
 * Format: Core|Env|{key}
 */
export const core_env_name = (key: string): string =>
  make_name(["Core", "Env", key]);

/**
 * Card slot cell naming. Use when creating cells that belong to a card.
 * Format: CARD|{cardId}|{slot}
 */
export const create_card_cell_name = (cardId: string, slot: string): string =>
  make_name([CARD_HEADER, cardId, slot]);

/**
 * Parse a label string into type and parts.
 * Labels use SEP as delimiter.
 */
export const parse_cell_label = (label: string): { type: string; parts: string[] } => {
  const parts = label.split(SEP);
  return { type: parts[0] ?? "", parts };
};

/**
 * In the traced graph, every node label starts with CELL| or PROPAGATOR|.
 * Card slot cells have label "CELL|CARD|{cardId}|{slot}" (cell_name is CARD|{cardId}|{slot}).
 * So prefix "CARD|" matches no nodes. Use this constant with graph:label / get_subgraph_by_label_prefix
 * to get the subgraph of all card slot cells.
 */
export const TRACED_GRAPH_LABEL_PREFIX_CARD_CELLS = make_name([CELL_HEADER, CARD_HEADER, ""]);
