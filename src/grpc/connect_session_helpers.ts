/**
 * Pure helpers for Session and OpenSession RPCs. Testable in isolation.
 */
import type { CompileRequestData } from "./decode.js"
import { apply_cards_delta_to_slot_map, type CardsDeltaData } from "./cards_delta_apply.js"
import { to_heartbeat_message, to_card_update_message } from "./session_encode.js"
import type { ServerMessage } from "./connect_generated/lain_pb.js"

/** Pure: heartbeat + card updates from decoded delta. */
export function delta_to_server_messages(decoded: CardsDeltaData): ServerMessage[] {
  const out: ServerMessage[] = [to_heartbeat_message()]
  for (const [key, ref] of Object.entries(decoded.slots)) {
    out.push(to_card_update_message(key, ref))
  }
  for (const key of decoded.remove) {
    out.push(to_card_update_message(key, null))
  }
  return out
}

/** Pure: initial slot map from initialData (empty if none). */
export function open_session_initial_slot_map(initialData: CompileRequestData): CompileRequestData {
  if (Object.keys(initialData).length === 0) {
    return {}
  }
  return apply_cards_delta_to_slot_map({ slots: initialData, remove: [] }, {})
}
