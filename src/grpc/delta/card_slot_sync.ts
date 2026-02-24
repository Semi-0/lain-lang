/**
 * Slot-map -> Card API synchronization (Part A reducer output -> Part B structure/runtime).
 */
import type { LexicalEnvironment } from "../../compiler/env/env";
import { add_card, build_card, connect_cards, detach_cards_by_key, remove_card, runtime_get_card, slot_above, slot_below, slot_left, slot_right, type SlotName, update_card } from "../card/card_api.js";
import type { CompileRequestData, CardRefData } from "../codec/decode.js";
import { key_to_card_and_slot } from "../codec/session_encode.js";

type StructuralEdge = {
  from_id: string;
  from_slot: SlotName;
  to_id: string;
  to_slot: SlotName;
};

export type CardApiEvent =
  | { type: "card_detach"; from_id: string; to_id: string }
  | { type: "card_remove"; card_id: string }
  | { type: "card_connect"; from_id: string; from_slot: SlotName; to_id: string; to_slot: SlotName }
  | { type: "card_update"; card_id: string; value: unknown };

export type CardApiApplyIssue =
  | { type: "missing_card_for_update_card"; card_id: string };

export type CardApiApplyReport = {
  issues: CardApiApplyIssue[];
};

const directional_slots: ReadonlySet<string> = new Set([
  slot_left,
  slot_right,
  slot_above,
  slot_below,
]);

const inverse_slot = (slot: string): SlotName | undefined => {
  if (slot === slot_left) return slot_right;
  if (slot === slot_right) return slot_left;
  if (slot === slot_above) return slot_below;
  if (slot === slot_below) return slot_above;
  return undefined;
};

const to_record = (value: unknown): Record<string, unknown> | undefined =>
  typeof value === "object" && value !== null ? (value as Record<string, unknown>) : undefined;

const extract_card_id_ref = (ref: CardRefData): string | undefined => {
  const value = ref.value;
  if (Array.isArray(value) && value[0] === "CardIdRef" && typeof value[1] === "string") {
    return value[1];
  }
  const obj = to_record(value);
  if (obj != null) {
    const tag = obj.kind ?? obj.type ?? obj.tag;
    const by_tag =
      tag === "CardIdRef"
        ? obj.card_id ?? obj.cardId ?? obj.target_id ?? obj.targetId ?? obj.id
        : undefined;
    if (typeof by_tag === "string" && by_tag.length > 0) {
      return by_tag;
    }
    const loose = obj.card_id ?? obj.cardId ?? obj.target_id ?? obj.targetId;
    if (typeof loose === "string" && loose.length > 0) {
      return loose;
    }
  }
  return typeof ref.id === "string" && ref.id.length > 0 ? ref.id : undefined;
};

const collect_card_ids = (slot_map: CompileRequestData): Set<string> => {
  const out = new Set<string>();
  for (const key of Object.keys(slot_map)) {
    const parsed = key_to_card_and_slot(key);
    if (parsed.card_id.length > 0) {
      out.add(parsed.card_id);
    }
  }
  return out;
};

const collect_edges = (slot_map: CompileRequestData): Map<string, StructuralEdge> => {
  const out = new Map<string, StructuralEdge>();
  for (const [key, ref] of Object.entries(slot_map)) {
    const parsed = key_to_card_and_slot(key);
    if (!directional_slots.has(parsed.slot)) {
      continue;
    }
    const to_id = extract_card_id_ref(ref);
    if (to_id == null || to_id.length === 0) {
      continue;
    }
    const to_slot = inverse_slot(parsed.slot);
    if (to_slot == null) {
      continue;
    }
    const from_slot = parsed.slot as SlotName;
    const direct_edge: StructuralEdge = {
      from_id: parsed.card_id,
      from_slot,
      to_id,
      to_slot,
    };
    const reverse_edge: StructuralEdge = {
      from_id: to_id,
      from_slot: to_slot,
      to_id: parsed.card_id,
      to_slot: from_slot,
    };
    const direct_key = `${direct_edge.from_id}|${direct_edge.from_slot}|${direct_edge.to_id}|${direct_edge.to_slot}`;
    const reverse_key = `${reverse_edge.from_id}|${reverse_edge.from_slot}|${reverse_edge.to_id}|${reverse_edge.to_slot}`;
    const canonical_key = direct_key <= reverse_key ? direct_key : reverse_key;
    const canonical_edge = direct_key <= reverse_key ? direct_edge : reverse_edge;
    out.set(canonical_key, canonical_edge);
  }
  return out;
};

const ensure_built_card = (env: LexicalEnvironment, card_id: string) => {
  const existing = runtime_get_card(card_id);
  if (existing != null) {
    return existing;
  }
  return build_card(env)(card_id);
};

function value_signature(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return `${typeof value}:${String(value)}`;
  }
  try {
    return `json:${JSON.stringify(value)}`;
  } catch {
    return `string:${String(value)}`;
  }
}

const sync_this_slots = (
  prev_slot_map: CompileRequestData,
  next_slot_map: CompileRequestData,
  out: CardApiEvent[]
): void => {
  for (const [key, ref] of Object.entries(next_slot_map)) {
    const parsed = key_to_card_and_slot(key);
    if (parsed.slot !== "::this") {
      continue;
    }
    const prev = prev_slot_map[key];
    const prev_signature = value_signature(prev?.value);
    const next_signature = value_signature(ref.value);
    if (prev !== undefined && prev_signature === next_signature) {
      continue;
    }
    out.push({
      type: "card_update",
      card_id: parsed.card_id,
      value: ref.value,
    });
  }
};

export function diff_slot_maps_to_card_api_events(
  prev_slot_map: CompileRequestData,
  next_slot_map: CompileRequestData
): CardApiEvent[] {
  const out: CardApiEvent[] = [];
  const prev_edges = collect_edges(prev_slot_map);
  const next_edges = collect_edges(next_slot_map);

  for (const [key, edge] of prev_edges.entries()) {
    if (!next_edges.has(key)) {
      out.push({
        type: "card_detach",
        from_id: edge.from_id,
        to_id: edge.to_id,
      });
    }
  }

  const prev_cards = collect_card_ids(prev_slot_map);
  const next_cards = collect_card_ids(next_slot_map);

  for (const card_id of prev_cards) {
    if (!next_cards.has(card_id)) {
      out.push({
        type: "card_remove",
        card_id,
      });
    }
  }

  for (const [key, edge] of next_edges.entries()) {
    if (prev_edges.has(key)) {
      continue;
    }
    out.push({
      type: "card_connect",
      from_id: edge.from_id,
      from_slot: edge.from_slot,
      to_id: edge.to_id,
      to_slot: edge.to_slot,
    });
  }

  sync_this_slots(prev_slot_map, next_slot_map, out);
  return out;
}

export function apply_card_api_events_io(
  env: LexicalEnvironment,
  events: readonly CardApiEvent[]
): CardApiApplyReport {
  const issues: CardApiApplyIssue[] = [];
  for (const event of events) {
    if (event.type === "card_detach") {
      detach_cards_by_key(event.from_id, event.to_id);
      continue;
    }
    if (event.type === "card_remove") {
      remove_card(event.card_id);
      continue;
    }
    if (event.type === "card_connect") {
      const from_card = ensure_built_card(env, event.from_id);
      const to_card = ensure_built_card(env, event.to_id);
      connect_cards(from_card, to_card, event.from_slot, event.to_slot);
      continue;
    }
    if (event.type === "card_update") {
      if (runtime_get_card(event.card_id) == null) {
        add_card(event.card_id);
      }
      update_card(event.card_id, event.value);
      continue;
    }
  }
  return { issues };
}

export function sync_slot_map_to_card_api_io(
  env: LexicalEnvironment,
  prev_slot_map: CompileRequestData,
  next_slot_map: CompileRequestData
): CardApiEvent[] {
  const events = diff_slot_maps_to_card_api_events(prev_slot_map, next_slot_map);
  apply_card_api_events_io(env, events);
  return events;
}
