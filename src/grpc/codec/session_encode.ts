/**
 * Encode ServerMessage (Heartbeat, CardUpdate) for Session RPC.
 * Uses connect_generated (Connect/bufbuild) message classes.
 */
import { CardRef, CardUpdate, Heartbeat, ServerMessage } from "../connect_generated/lain_pb.js"
import type { CardRefData } from "./decode.js"
import type { LayeredObject } from "sando-layer/Basic/LayeredObject"
import { is_layered_object } from "sando-layer/Basic/LayeredObject"
import { json_layered_object_serializer } from "sando-layer/Basic/LayeredSerializer"

const encoder = new TextEncoder()

function encode_value(value: unknown): Uint8Array {
  const json = is_layered_object(value) ? json_layered_object_serializer(value as LayeredObject<unknown>) : JSON.stringify(value)
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
