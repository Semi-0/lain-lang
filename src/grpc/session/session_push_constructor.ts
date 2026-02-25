/**
 * Combinator: (get_sessions) => (event) => void
 * Forward runtime card output events to all session queues.
 */
import type { RuntimeCardOutputEvent } from "../bridge/card_runtime_events.js"
import type { SessionState } from "./session_store.js"
import { session_push } from "./session_store.js"
import { to_card_update_message } from "../codec/session_encode.js"

export const session_push_constructor = (get_sessions: () => SessionState[]) =>
  (event: RuntimeCardOutputEvent): void => {
    const key = `${event.cardId}${event.slot}`
    const msg = to_card_update_message(key, { id: event.cardId, value: event.value })
    for (const state of get_sessions()) {
      session_push(state, msg)
    }
  }
