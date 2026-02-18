/**
 * Connect RPC server for LainViz (Compile + NetworkStream + Session, OpenSession + PushDeltas).
 * Session: bidi stream (non-browser). OpenSession + PushDeltas: browser-compatible.
 */
import { ConnectRouter } from "@bufbuild/connect"
import { connectNodeAdapter } from "@connectrpc/connect-node"
import { Effect, pipe } from "effect"
import { compose } from "generic-handler/built_in_generics/generic_combinator"
import type { LexicalEnvironment } from "../../compiler/env/env"
import { CompileResponse, Empty, NetworkUpdate, ServerMessage, StrongestValueLayer } from "./connect_generated/lain_pb.js"
import { LainViz } from "./connect_generated/lain_connect.js"
import { to_compile_request_data, to_cards_delta_data, to_open_session_data, to_push_deltas_data } from "./decode.js"
import { apply_cards_delta_to_slot_map } from "./cards_delta_apply.js"
import { encode_network_update } from "./encode"
import { to_heartbeat_message, to_card_update_message } from "./session_encode.js"
import {
  get_or_create_session,
  get_session,
  remove_session,
  session_push,
  wait_for_message_or_timeout,
} from "./session_store.js"
import type { NetworkUpdateData } from "./network_stream_handler"
import { bind_context_slots_io, compile_for_viz, type CompileResult } from "./compile_handler"
import { cell_updates_iterable } from "./network_stream_handler"
import { trace_compile_request_io, trace_network_stream_io, trace_open_session_io, trace_push_deltas_io } from "./tracer"

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

export function create_connect_routes(env: LexicalEnvironment): (router: ConnectRouter) => void {
  return (router: ConnectRouter) => {
    router.service(LainViz, {
      compile(req): CompileResponse {
        return handle_compile(req, env)
      },
      async *networkStream(req, context): AsyncGenerator<NetworkUpdate> {
        const data = Effect.runSync(prepare_stream_data_effect(req))
        yield* stream_connect_updates(data, context)
      },
      async *session(requestStream, _context): AsyncGenerator<ServerMessage> {
        let slotMap: ReturnType<typeof to_compile_request_data> = {}
        for await (const delta of requestStream) {
          const slotCount = Object.keys(delta.slots ?? {}).length
          const removeCount = (delta.remove ?? []).length
          console.log("[connect] session rcvd delta:", slotCount, "slots, remove:", removeCount)
          const decoded = to_cards_delta_data({
            slots: delta.slots ?? {},
            remove: delta.remove ?? [],
          })
          slotMap = apply_cards_delta_to_slot_map(decoded, slotMap)
          Effect.runSync(Effect.sync(() => bind_context_slots_io(env, slotMap)))
          yield to_heartbeat_message()
          for (const [key, ref] of Object.entries(decoded.slots)) {
            yield to_card_update_message(key, ref)
          }
          for (const key of decoded.remove) {
            yield to_card_update_message(key, null)
          }
        }
      },
      async *openSession(req, context): AsyncGenerator<ServerMessage> {
        const { sessionId, initialData } = to_open_session_data(req)
        Effect.runSync(Effect.sync(() => trace_open_session_io(req, { sessionId, slotCount: Object.keys(initialData).length })))
        const initialSlotMap =
          Object.keys(initialData).length > 0
            ? apply_cards_delta_to_slot_map({ slots: initialData, remove: [] }, {})
            : {}
        const state = get_or_create_session(sessionId, initialSlotMap)
        if (Object.keys(initialData).length > 0) {
          Effect.runSync(Effect.sync(() => bind_context_slots_io(env, state.slotMap)))
        }
        try {
          yield to_heartbeat_message()
          while (context.signal?.aborted !== true) {
            const hasMessage = await wait_for_message_or_timeout(state)
            if (context.signal?.aborted === true) break
            if (hasMessage && state.queue.length > 0) {
              while (state.queue.length > 0) {
                const msg = state.queue.shift()!
                yield msg
              }
            } else {
              yield to_heartbeat_message()
            }
          }
        } finally {
          remove_session(sessionId)
        }
      },
      async pushDeltas(req): Promise<Empty> {
        const { sessionId, delta: decoded } = to_push_deltas_data(req)
        Effect.runSync(
          Effect.sync(() =>
            trace_push_deltas_io(req, {
              sessionId,
              slotCount: Object.keys(decoded.slots).length,
              removeCount: decoded.remove.length,
              slotKeys: Object.keys(decoded.slots),
              removeKeys: [...decoded.remove],
            })
          )
        )
        const state = get_session(sessionId)
        if (state == null) {
          return new Empty()
        }
        state.slotMap = apply_cards_delta_to_slot_map(decoded, state.slotMap)
        Effect.runSync(Effect.sync(() => bind_context_slots_io(env, state.slotMap)))
        session_push(state, to_heartbeat_message())
        for (const [key, ref] of Object.entries(decoded.slots)) {
          session_push(state, to_card_update_message(key, ref))
        }
        for (const key of decoded.remove) {
          session_push(state, to_card_update_message(key, null))
        }
        return new Empty()
      },
    })
  }
}

export function create_connect_handler_io(env: LexicalEnvironment): ReturnType<typeof connectNodeAdapter> {
  return connectNodeAdapter({
    routes: create_connect_routes(env),
  })
}
