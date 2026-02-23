/**
 * Session state for OpenSession + PushDeltas. One entry per sessionId.
 * Mutation isolated here; apply_cards_delta and session_encode stay pure.
 */
import type { ServerMessage } from "../connect_generated/lain_pb.js"
import type { CompileRequestData } from "../codec/decode.js"

const HEARTBEAT_MS = 8000

export type SessionState = {
  slotMap: CompileRequestData
  readonly queue: ServerMessage[]
  resolveWait: (() => void) | null
}

const sessions = new Map<string, SessionState>()

function create_state(initialSlotMap: CompileRequestData): SessionState {
  return {
    slotMap: { ...initialSlotMap },
    queue: [],
    resolveWait: null,
  }
}

/** Create session; idempotent for same id (returns existing). */
export function get_or_create_session(sessionId: string, initialSlotMap: CompileRequestData = {}): SessionState {
  const existing = sessions.get(sessionId)
  if (existing != null) {
    return existing
  }
  const state = create_state(initialSlotMap)
  sessions.set(sessionId, state)
  return state
}

export function get_session(sessionId: string): SessionState | undefined {
  return sessions.get(sessionId)
}

export function remove_session(sessionId: string): void {
  sessions.delete(sessionId)
}

/** Push messages to session queue and wake any waiter. */
export function session_push(state: SessionState, ...messages: ServerMessage[]): void {
  state.queue.push(...messages)
  if (state.resolveWait != null) {
    const r = state.resolveWait
    state.resolveWait = null
    r()
  }
}

/** Wait until queue has messages or timeout; returns true if queue non-empty. */
export function wait_for_message_or_timeout(state: SessionState, ms: number = HEARTBEAT_MS): Promise<boolean> {
  if (state.queue.length > 0) {
    return Promise.resolve(true)
  }
  return new Promise<boolean>((resolve) => {
    const t = setTimeout(() => {
      state.resolveWait = null
      resolve(false)
    }, ms)
    state.resolveWait = () => {
      clearTimeout(t)
      resolve(true)
    }
  })
}
