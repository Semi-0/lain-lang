/**
 * Session combinator: builds sessions_push and openSession handler from session store.
 * All session-related route logic in one place; connect_server only wires routes.
 *
 * Primitives: trace, get_or_create, apply_events, bind, drain, heartbeat.
 * Combinator: create_session_combinator(env) => { sessions_push, init, openSession }.
 */
import { Effect } from "effect"
import type { LexicalEnvironment } from "../../../compiler/env/env"
import type { ServerMessage } from "../connect_generated/lain_pb.js"
import type { RuntimeCardOutputEvent } from "../bridge/card_runtime_events.js"
import { to_open_session_data } from "../codec/decode.js"
import { to_heartbeat_message } from "../codec/session_encode.js"
import { open_session_initial_slot_map } from "./connect_session_helpers.js"
import {
  get_all_sessions,
  get_or_create_session,
  remove_session,
  wait_for_message_or_timeout,
  type SessionState,
} from "./session_store.js"
import { session_push_constructor } from "./session_push_constructor.js"
import { init_runtime_card_output_io } from "../bridge/card_runtime_events.js"
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

const run_io = (fn: () => void): void => Effect.runSync(Effect.sync(fn))

const has_initial_slots = (slotMap: CompileRequestData): boolean =>
  Object.keys(slotMap).length > 0

const is_aborted = (ctx: StreamContext): boolean =>
  ctx.signal?.aborted === true

/** Trace open-session request. */
function trace_open_setup_io(req: OpenSessionReq, sessionId: string, slotCount: number): void {
  run_io(() => trace_open_session_io(req, { sessionId, slotCount }))
}

/** Apply initial slot map to env: diff → apply events → bind. */
function apply_initial_slots_to_env_io(
  env: LexicalEnvironment,
  slotMap: CompileRequestData
): void {
  const events = diff_slot_maps_to_card_api_events({}, slotMap)
  run_io(() => trace_card_events_io("open_session_initial", events))
  const report = Effect.runSync(Effect.sync(() => apply_card_api_events_io(env, events)))
  if (report.issues.length > 0) {
    run_io(() => trace_card_events_io("open_session_apply", report.issues))
  }
  run_io(() => bind_context_slots_io(env, slotMap))
}

/** Trace, create session, optionally bind. Returns session state. */
function open_session_setup_io(
  req: OpenSessionReq,
  env: LexicalEnvironment,
  sessionId: string,
  initialSlotMap: CompileRequestData
): SessionState {
  trace_open_setup_io(req, sessionId, Object.keys(initialSlotMap).length)
  const state = get_or_create_session(sessionId, initialSlotMap)
  if (has_initial_slots(initialSlotMap)) {
    apply_initial_slots_to_env_io(env, state.slotMap)
  } else {
    // no-op
  }
  return state
}

/** Yield queued messages until empty or aborted. */
async function* drain_queue_until_empty_or_aborted(
  state: SessionState,
  ctx: StreamContext,
  sessionId: string
): AsyncGenerator<ServerMessage> {
  while (!is_aborted(ctx) && state.queue.length > 0) {
    const msg = state.queue.shift()!
    run_io(() => trace_open_session_yield_io(sessionId, msg))
    yield msg
  }
}

/** Yield heartbeat. */
function yield_heartbeat_io(sessionId: string): ServerMessage {
  const msg = to_heartbeat_message()
  run_io(() => trace_open_session_yield_io(sessionId, msg))
  return msg
}

/** Main yield loop: wait → drain or heartbeat → repeat until aborted. */
async function* open_session_yield_loop(
  state: SessionState,
  ctx: StreamContext,
  sessionId: string
): AsyncGenerator<ServerMessage> {
  while (!is_aborted(ctx)) {
    const hasMessage = await wait_for_message_or_timeout(state)
    if (is_aborted(ctx)) {
      return
    }
    if (hasMessage && state.queue.length > 0) {
      yield* drain_queue_until_empty_or_aborted(state, ctx, sessionId)
    } else {
      yield yield_heartbeat_io(sessionId)
    }
  }
}

export type SessionCombinator = {
  readonly sessions_push: (event: RuntimeCardOutputEvent) => void
  readonly openSession: (req: OpenSessionReq, ctx: StreamContext) => AsyncGenerator<ServerMessage>
  readonly init: () => void
}

/** Build all session combinators from session store. */
export function create_session_combinator(env: LexicalEnvironment): SessionCombinator {
  const sessions_push = session_push_constructor(get_all_sessions)
  return {
    sessions_push,
    init: () => init_runtime_card_output_io(sessions_push),
    openSession: open_session_handler(env),
  }
}

function open_session_handler(
  env: LexicalEnvironment
): (req: OpenSessionReq, ctx: StreamContext) => AsyncGenerator<ServerMessage> {
  return async function* (
    req: OpenSessionReq,
    ctx: StreamContext
  ): AsyncGenerator<ServerMessage> {
    const { sessionId, initialData } = to_open_session_data(req)
    const initialSlotMap = open_session_initial_slot_map(initialData)
    const state = open_session_setup_io(req, env, sessionId, initialSlotMap)
    try {
      yield to_heartbeat_message()
      yield* open_session_yield_loop(state, ctx, sessionId)
    } finally {
      remove_session(sessionId)
    }
  }
}
