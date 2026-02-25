/**
 * Connect RPC server for LainViz (Compile + NetworkStream + Session, OpenSession + PushDeltas).
 * Session: bidi stream (non-browser). OpenSession + PushDeltas: browser-compatible.
 */
import { ConnectRouter } from "@bufbuild/connect"
import { connectNodeAdapter } from "@connectrpc/connect-node"
import { Effect, pipe } from "effect"
import { compose } from "generic-handler/built_in_generics/generic_combinator"
import type { LexicalEnvironment } from "../../compiler/env/env"
import { CardBuildResponse, CompileResponse, Empty, NetworkUpdate, ServerMessage, StrongestValueLayer } from "./connect_generated/lain_pb.js"
import { LainViz } from "./connect_generated/lain_connect.js"
import { to_card_build_data, to_compile_request_data, to_cards_delta_data, to_push_deltas_data } from "./codec/decode.js"
import { apply_cards_delta_to_slot_map } from "./delta/cards_delta_apply.js"
import { encode_network_update, type NetworkUpdateData } from "./codec/encode.js"
import { delta_to_server_messages } from "./session/connect_session_helpers.js"
import { get_or_create_session, get_session, type SessionState } from "./session/session_store.js"
import { create_session_combinator } from "./session/session_combinator.js"
import { bind_context_slots_io, compile_for_viz, type CompileResult } from "./handlers/compile_handler.js"
import { cell_updates_iterable } from "./handlers/network_stream_handler.js"
import {
  trace_card_build_io,
  trace_card_events_io,
  trace_compile_request_io,
  trace_network_stream_io,
  trace_push_deltas_io,
} from "./util/tracer.js"
import {
  apply_card_api_events_io,
  diff_slot_maps_to_card_api_events,
  type CardApiApplyReport,
} from "./delta/card_slot_sync.js"
import { build_card, update_card } from "./card/card_api.js"

type EncodedNetworkUpdate = ReturnType<typeof encode_network_update>

function encoded_update_to_connect(raw: EncodedNetworkUpdate): NetworkUpdate {
  const value = raw.strongestValue?.value ?? new Uint8Array(0)
  return new NetworkUpdate({
    cellId: raw.cellId,
    name: raw.name,
    strongestValue: new StrongestValueLayer({
      value: value as Uint8Array<ArrayBuffer>,
      timestamp: BigInt(raw.strongestValue?.timestamp ?? 0),
      sourceId: raw.strongestValue?.sourceId ?? "",
    }),
  })
}

const toConnectNetworkUpdate = compose(encode_network_update, encoded_update_to_connect) as (
  u: NetworkUpdateData
) => NetworkUpdate

function result_to_connect_response(r: CompileResult): CompileResponse {
  return new CompileResponse({
    success: r.success,
    errorMessage: r.error_message ?? "",
  })
}

/** Data → compile → Connect response (sequential pipeline). */
const data_to_connect_response = compose(compile_for_viz, result_to_connect_response) as (
  data: ReturnType<typeof to_compile_request_data>
) => CompileResponse

type CompileRequestData = ReturnType<typeof to_compile_request_data>

function compile_request_to_response_effect(
  req: Parameters<typeof to_compile_request_data>[0],
  env: LexicalEnvironment
) {
  return pipe(
    Effect.sync(() => to_compile_request_data(req)),
    Effect.tap((data: CompileRequestData) =>
      Effect.sync(() => {
        trace_compile_request_io(req, data)
        bind_context_slots_io(env, data)
      })
    ),
    Effect.map(data_to_connect_response)
  )
}

function handle_compile(
  req: Parameters<typeof to_compile_request_data>[0],
  env: LexicalEnvironment
): CompileResponse {
  return Effect.runSync(compile_request_to_response_effect(req, env))
}

function prepare_stream_data_effect(req: Parameters<typeof to_compile_request_data>[0]) {
  return pipe(
    Effect.sync(() => to_compile_request_data(req)),
    Effect.tap((data: CompileRequestData) =>
      Effect.sync(() => trace_network_stream_io(req, undefined, data))
    )
  )
}

async function* stream_connect_updates(
  data: CompileRequestData,
  context: { signal?: AbortSignal }
): AsyncGenerator<NetworkUpdate> {
  for await (const u of cell_updates_iterable(data, context.signal)) {
    yield toConnectNetworkUpdate(u)
  }
}

type CardsDeltaData = ReturnType<typeof to_cards_delta_data>

/** Apply delta to slot map, bind env, return next slot map. */
function session_apply_and_bind_io(
  env: LexicalEnvironment,
  slotMap: CompileRequestData,
  decoded: CardsDeltaData
): CompileRequestData {
  const slotCount = Object.keys(decoded.slots).length
  const removeCount = decoded.remove.length
  console.log("[connect] session rcvd delta:", slotCount, "slots, remove:", removeCount)
  const nextSlotMap = apply_cards_delta_to_slot_map(decoded, slotMap)
  const events = diff_slot_maps_to_card_api_events(slotMap, nextSlotMap)
  const report = Effect.runSync(
    Effect.sync(() => {
      trace_card_events_io("session", events)
      return apply_card_api_events_io(env, events)
    })
  )
  if (report.issues.length > 0) {
    Effect.runSync(Effect.sync(() => trace_card_events_io("session_apply", report.issues)))
  }
  Effect.runSync(Effect.sync(() => bind_context_slots_io(env, nextSlotMap)))
  return nextSlotMap
}

async function* handle_session_route(
  requestStream: AsyncIterable<{ slots?: Record<string, unknown>; remove?: readonly string[] }>,
  _context: unknown,
  env: LexicalEnvironment
): AsyncGenerator<ServerMessage> {
  let slotMap: CompileRequestData = {}
  for await (const delta of requestStream) {
    const decoded = to_cards_delta_data({ slots: delta.slots ?? {}, remove: delta.remove ?? [] })
    slotMap = session_apply_and_bind_io(env, slotMap, decoded)
    for (const msg of delta_to_server_messages(decoded)) {
      yield msg
    }
  }
}

function push_deltas_apply_io(
  req: Parameters<typeof to_push_deltas_data>[0],
  env: LexicalEnvironment
): Empty {
  return Effect.runSync(
    pipe(
      Effect.sync(() => decode_push_deltas_io(req)),
      Effect.map((decoded) => ({
        decoded,
        resolved: resolve_push_session_io(decoded.sessionId),
      })),
      Effect.map((ctx) => ({
        ...ctx,
        transition: derive_push_transition(ctx.resolved.state.slotMap, ctx.decoded.delta),
      })),
      Effect.tap((ctx) =>
        Effect.sync(() => apply_push_events_and_bind_io(env, ctx.resolved.state, ctx.transition))
      ),
      Effect.tap((ctx) =>
        Effect.sync(() =>
          trace_push_outcome_io(
            ctx.decoded.traceData,
            ctx.resolved.existed,
            ctx.transition.events,
            ctx.transition.report
          )
        )
      ),
      // Effect.tap((ctx) =>
      //   Effect.sync(() =>
      //     enqueue_push_messages_io(ctx.resolved.state, ctx.decoded.delta, ctx.resolved.existed)
      //   )
      // ),
      Effect.map(() => new Empty())
    )
  )
}

type PushDeltaDecoded = {
  sessionId: string
  delta: ReturnType<typeof to_push_deltas_data>["delta"]
  traceData: {
    sessionId: string
    slotCount: number
    removeCount: number
    slotKeys: string[]
    removeKeys: string[]
  }
}

function decode_push_deltas_io(
  req: Parameters<typeof to_push_deltas_data>[0]
): PushDeltaDecoded {
  const { sessionId, delta } = to_push_deltas_data(req)
  const traceData = {
    sessionId,
    slotCount: Object.keys(delta.slots).length,
    removeCount: delta.remove.length,
    slotKeys: Object.keys(delta.slots),
    removeKeys: [...delta.remove],
  }
  Effect.runSync(Effect.sync(() => trace_push_deltas_io(req, traceData)))
  return {
    sessionId,
    delta,
    traceData,
  }
}

function resolve_push_session_io(sessionId: string): { state: SessionState; existed: boolean } {
  const existingState = get_session(sessionId)
  if (existingState != null) {
    return {
      state: existingState,
      existed: true,
    }
  }
  const state = get_or_create_session(sessionId, {})
  return {
    state,
    existed: false,
  }
}

function derive_push_transition(
  prevSlotMap: CompileRequestData,
  decoded: ReturnType<typeof to_push_deltas_data>["delta"]
): { nextSlotMap: CompileRequestData; events: ReturnType<typeof diff_slot_maps_to_card_api_events>; report?: CardApiApplyReport } {
  const nextSlotMap = apply_cards_delta_to_slot_map(decoded, prevSlotMap)
  const events = diff_slot_maps_to_card_api_events(prevSlotMap, nextSlotMap)
  return {
    nextSlotMap,
    events,
  }
}

function apply_push_events_and_bind_io(
  env: LexicalEnvironment,
  state: SessionState,
  transition: { nextSlotMap: CompileRequestData; events: ReturnType<typeof diff_slot_maps_to_card_api_events>; report?: CardApiApplyReport }
): void {
  const report = Effect.runSync(
    Effect.sync(() => apply_card_api_events_io(env, transition.events))
  )
  state.slotMap = transition.nextSlotMap
  transition.report = report
}

function trace_push_outcome_io(
  traceData: PushDeltaDecoded["traceData"],
  existed: boolean,
  events: ReturnType<typeof diff_slot_maps_to_card_api_events>,
  report?: CardApiApplyReport
): void {
  Effect.runSync(
    Effect.sync(() => {
      if (!existed) {
        trace_card_events_io("push_deltas_no_session", [
          { type: "session_created_for_push_deltas", session_id: traceData.sessionId },
        ])
      }
      trace_card_events_io("push_deltas", events)
      if (report != null && report.issues.length > 0) {
        trace_card_events_io("push_deltas_apply", report.issues)
      }
    })
  )
}

function enqueue_push_messages_io(
  state: SessionState,
  decoded: ReturnType<typeof to_push_deltas_data>["delta"],
  existed: boolean
): void {
  if (!existed) {
    return
  }
  // session_push(state, to_heartbeat_message())
  // for (const [key, ref] of Object.entries(decoded.slots)) {
  //   session_push(state, to_card_update_message(key, ref))
  // }
  // for (const key of decoded.remove) {
  //   session_push(state, to_card_update_message(key, null))
  // }
}

function card_build_apply_io(
  req: Parameters<typeof to_card_build_data>[0],
  env: LexicalEnvironment
): CardBuildResponse {
  const { sessionId, cardId } = to_card_build_data(req)
  Effect.runSync(Effect.sync(() => trace_card_build_io(req, { sessionId, cardId })))
  if (cardId.length === 0) {
    return new CardBuildResponse({ success: false, errorMessage: "card_id is required" })
  }

  const state = sessionId.length > 0 ? get_session(sessionId) : undefined
  if (sessionId.length > 0 && state == null) {
    return new CardBuildResponse({ success: false, errorMessage: `session not found: ${sessionId}` })
  }

  build_card(env)(cardId)
  const codeKey = `${cardId}code`
  const codeValue = state?.slotMap?.[codeKey]?.value
  if (typeof codeValue === "string") {
    update_card(cardId, codeValue)
  }

  return new CardBuildResponse({ success: true, errorMessage: "" })
}

async function* handle_network_stream_route(
  req: Parameters<typeof to_compile_request_data>[0],
  context: { signal?: AbortSignal }
): AsyncGenerator<NetworkUpdate> {
  const data = Effect.runSync(prepare_stream_data_effect(req))
  yield* stream_connect_updates(data, context)
}

export function create_connect_routes(env: LexicalEnvironment): (router: ConnectRouter) => void {
  const session = create_session_combinator(env)
  session.init()

  return (router: ConnectRouter) => {
    router.service(LainViz, {
      compile: (req) => handle_compile(req, env),
      networkStream: (req, ctx) => handle_network_stream_route(req, ctx),
      session: (stream, ctx) => handle_session_route(stream, ctx, env),
      openSession: (req, ctx) => session.openSession(req, ctx),
      pushDeltas: (req) => Promise.resolve(push_deltas_apply_io(req, env)),
      cardBuild: (req) => Promise.resolve(card_build_apply_io(req, env)),
    })
  }
}

export function create_connect_handler_io(env: LexicalEnvironment): ReturnType<typeof connectNodeAdapter> {
  return connectNodeAdapter({
    routes: create_connect_routes(env),
  })
}
