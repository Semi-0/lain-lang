/**
 * Connect RPC server for LainViz (Compile + NetworkStream).
 * Protocol-agnostic decode via to_compile_request_data; same compile/stream logic as gRPC.
 * Uses Effect for sequential pipelines and pipe/compose for composition.
 */
import { ConnectRouter } from "@bufbuild/connect"
import { connectNodeAdapter } from "@connectrpc/connect-node"
import { Effect, pipe } from "effect"
import { compose } from "generic-handler/built_in_generics/generic_combinator"
import type { LexicalEnvironment } from "../../compiler/env/env"
import { CompileResponse, NetworkUpdate, StrongestValueLayer } from "./connect_generated/lain_pb.js"
import { LainViz } from "./connect_generated/lain_connect.js"
import { to_compile_request_data } from "./decode"
import { encode_network_update } from "./encode"
import type { NetworkUpdateData } from "./network_stream_handler"
import { bind_context_slots_io, compile_for_viz, type CompileResult } from "./compile_handler"
import { cell_updates_iterable } from "./network_stream_handler"
import { trace_compile_request_io, trace_network_stream_io } from "./tracer"

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
    })
  }
}

export function create_connect_handler_io(env: LexicalEnvironment): ReturnType<typeof connectNodeAdapter> {
  return connectNodeAdapter({
    routes: create_connect_routes(env),
  })
}
