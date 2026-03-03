/**
 * Encode ServerMessage (Heartbeat, CardUpdate) for Session RPC.
 * Uses connect_generated (Connect/bufbuild) message classes.
 */
import { CardRef, CardUpdate, Heartbeat, ServerMessage } from "../connect_generated/lain_pb.js"
import type { CardRefData } from "./decode.js"
import type { LayeredObject } from "sando-layer/Basic/LayeredObject"
import { is_layered_object } from "sando-layer/Basic/LayeredObject"
import { base_serializer, json_layered_object_serializer } from "sando-layer/Basic/LayeredSerializer"
import { define_generic_procedure_handler } from "generic-handler/GenericProcedure"
import { match_args } from "generic-handler/Predicates"
import { register_predicate } from "generic-handler/Predicates"

const encoder = new TextEncoder()

/** Duck-type predicate: value has forEachNode and forEachEdge (graphology-like). */
export const is_graphology_graph = register_predicate(
  "is_graphology_graph",
  (value: unknown): value is { forEachNode: (fn: (n: string, a: unknown) => void) => void; forEachEdge: (fn: (e: string, a: unknown, s: string, t: string) => void) => void } =>
    value != null &&
    typeof value === "object" &&
    typeof (value as Record<string, unknown>).forEachNode === "function" &&
    typeof (value as Record<string, unknown>).forEachEdge === "function"
)

let _graphology_serializer_loaded = false

/** Register graphology handler on base_serializer. Call from connect_server init. */
export function load_graphology_serializer(): void {
  if (_graphology_serializer_loaded) return
  define_generic_procedure_handler(
    base_serializer,
    match_args(is_graphology_graph),
    (g: GraphologyLike) => graphology_graph_to_graph_data(g)
  )
  _graphology_serializer_loaded = true
}

export function encode_value(value: unknown): Uint8Array {
  const json = is_layered_object(value)
    ? json_layered_object_serializer(value as LayeredObject<unknown>)
    : is_graphology_graph(value)
      ? JSON.stringify(graphology_graph_to_graph_data(value as GraphologyLike))
      : JSON.stringify(value)
  return encoder.encode(json)
}

function card_ref_data_to_proto(ref: CardRefData): CardRef {
  const bytes = encode_value(ref.value)
  return new CardRef({
    id: ref.id,
    value: new Uint8Array(bytes) as Uint8Array<ArrayBuffer>,
  })
}

/** Build Heartbeat ServerMessage. */
export function to_heartbeat_message(): ServerMessage {
  return new ServerMessage({ kind: { case: "heartbeat", value: new Heartbeat() } })
}

/** Build CardUpdate ServerMessage. key format: "${cardId}code" or "${cardId}::slot". ref null = remove. */
export function to_card_update_message(
  key: string,
  ref: CardRefData | null
): ServerMessage {
  const { card_id, slot } = key_to_card_and_slot(key)
  const cardUpdate = new CardUpdate({
    cardId: card_id,
    slot,
    ref: ref != null ? card_ref_data_to_proto(ref) : undefined,
  })
  return new ServerMessage({ kind: { case: "cardUpdate", value: cardUpdate } })
}

/** GraphData per TRANSPORTATION.md: { nodes: { id, label? }[], links: { source, target }[] } */
export type GraphData = {
  readonly nodes: readonly { id: string; label?: string }[]
  readonly links: readonly { source: string; target: string }[]
}

type GraphologyLike = {
  forEachNode: (fn: (node: string, attrs: { label?: string }) => void) => void
  forEachEdge: (fn: (edge: string, _attrs: unknown, source: string, target: string) => void) => void
}

/**
 * Encode graphology Graph to GraphData (wire/display format).
 * Node attributes may include `label`; default to node key if absent.
 */
export function graphology_graph_to_graph_data(g: GraphologyLike): GraphData {
  const nodes: { id: string; label: string }[] = []
  g.forEachNode((node, attrs) => {
    nodes.push({ id: node, label: attrs?.label ?? node })
  })
  const links: { source: string; target: string }[] = []
  g.forEachEdge((_edge, _attrs, source, target) => {
    links.push({ source, target })
  })
  return { nodes, links }
}

/** Parse slot key into card_id and slot. e.g. "card-1code" -> { card_id: "card-1", slot: "code" }. */
export function key_to_card_and_slot(key: string): { card_id: string; slot: string } {
  if (key.endsWith("code")) {
    return { card_id: key.slice(0, -4), slot: "code" }
  }
  const i = key.indexOf("::")
  if (i >= 0) {
    return { card_id: key.slice(0, i), slot: key.slice(i) }
  }
  return { card_id: key, slot: "" }
}
