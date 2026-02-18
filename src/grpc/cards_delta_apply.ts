/**
 * Pure applicator: apply CardsDelta to slot map. Returns new map (readonly).
 * Handles both complete (full replace) and incremental deltas.
 */
import type { CompileRequestData } from "./decode.js"

export type CardsDeltaData = {
  readonly slots: CompileRequestData
  readonly remove: readonly string[]
}

/** Pure: apply delta to map; return new map. For each key in remove, delete; for each key in slots, set. */
export function apply_cards_delta_to_slot_map(
  delta: CardsDeltaData,
  map: CompileRequestData
): CompileRequestData {
  const next: Record<string, { readonly id: string; readonly value: unknown }> = { ...map }
  for (const k of delta.remove) {
    delete next[k]
  }
  for (const [k, v] of Object.entries(delta.slots)) {
    next[k] = v
  }
  return next
}
