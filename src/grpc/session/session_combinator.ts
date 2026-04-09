/**
 * Session factory: creates the openSession handler with per-session bridge subscription.
 * Each openSession call subscribes to runtime card output events for its lifetime and
 * unsubscribes on stream close — no global fan-out scan, no separate init() call.
 */
import type { LexicalEnvironment } from "../../../compiler/env/env"
import type { ServerMessage } from "../connect_generated/lain_pb.js"
import type { RuntimeCardOutputEvent } from "../bridge/card_runtime_events.js"
import { to_open_session_data } from "../codec/decode.js"
import { to_heartbeat_message, to_card_update_message } from "../codec/session_encode.js"
import { open_session_initial_slot_map } from "./connect_session_helpers.js"
import {
  get_or_create_session,
  remove_session,
  session_push,
  wait_for_message_or_timeout,
  type SessionState,
} from "./session_store.js"
import { subscribe_runtime_card_output } from "../bridge/card_runtime_events.js"
import { bind_context_slots_io } from "../handlers/compile_handler.js"
import {
  diff_slot_maps_to_card_api_events,
  apply_card_api_events_io,
} from "../delta/card_slot_sync.js"
import {
  trace_open_session_io,
  trace_open_session_yield_io,
  trace_card_events_io,
} from "../util/tracer.js"

type OpenSessionReq = Parameters<typeof to_open_session_data>[0]
type CompileRequestData = ReturnType<typeof to_open_session_data>["initialData"]
type StreamContext = { signal?: AbortSignal }

const has_initial_slots = (slotMap: CompileRequestData): boolean =>
  Object.keys(slotMap).length > 0

const is_aborted = (ctx: StreamContext): boolean =>
  ctx.signal?.aborted === true

function apply_initial_slots_to_env_io(
  env: LexicalEnvironment,
  slotMap: CompileRequestData
): void {
  const events = diff_slot_maps_to_card_api_events({}, slotMap)
  trace_card_events_io("open_session_initial", events)
  const report = apply_card_api_events_io(env, events)
  if (report.issues.length > 0) {
    trace_card_events_io("open_session_apply", report.issues)
  }
  bind_context_slots_io(env, slotMap)
}

function open_session_setup_io(
  req: OpenSessionReq,
  env: LexicalEnvironment,
  sessionId: string,
  initialSlotMap: CompileRequestData
): SessionState {
  trace_open_session_io(req, { sessionId, slotCount: Object.keys(initialSlotMap).length })
  const state = get_or_create_session(sessionId, initialSlotMap)
  if (has_initial_slots(initialSlotMap)) {
    apply_initial_slots_to_env_io(env, state.slotMap)
  }
  return state
}

async function* drain_queue_until_empty_or_aborted(
  state: SessionState,
  ctx: StreamContext,
  sessionId: string
): AsyncGenerator<ServerMessage> {
  while (!is_aborted(ctx) && state.queue.length > 0) {
    const msg = state.queue.shift()!
    trace_open_session_yield_io(sessionId, msg)
    yield msg
  }
}

async function* open_session_yield_loop(
  state: SessionState,
  ctx: StreamContext,
  sessionId: string
): AsyncGenerator<ServerMessage> {
  while (!is_aborted(ctx)) {
    const hasMessage = await wait_for_message_or_timeout(state)
    if (is_aborted(ctx)) return
    if (hasMessage && state.queue.length > 0) {
      yield* drain_queue_until_empty_or_aborted(state, ctx, sessionId)
    } else {
      const msg = to_heartbeat_message()
      trace_open_session_yield_io(sessionId, msg)
      yield msg
    }
  }
}

export type Session = {
  readonly openSession: (req: OpenSessionReq, ctx: StreamContext) => AsyncGenerator<ServerMessage>
}

export function create_session(env: LexicalEnvironment): Session {
  return { openSession: open_session_handler(env) }
}

function open_session_handler(
  env: LexicalEnvironment
): (req: OpenSessionReq, ctx: StreamContext) => AsyncGenerator<ServerMessage> {
  return async function* (req: OpenSessionReq, ctx: StreamContext): AsyncGenerator<ServerMessage> {
    const { sessionId, initialData } = to_open_session_data(req)
    const initialSlotMap = open_session_initial_slot_map(initialData)
    const state = open_session_setup_io(req, env, sessionId, initialSlotMap)

    const unsubscribe = subscribe_runtime_card_output((event: RuntimeCardOutputEvent) => {
      const key = `${event.cardId}${event.slot}`
      session_push(state, to_card_update_message(key, { id: event.cardId, value: event.value }))
    })

    try {
      yield to_heartbeat_message()
      yield* open_session_yield_loop(state, ctx, sessionId)
    } finally {
      unsubscribe()
      remove_session(sessionId)
    }
  }
}
