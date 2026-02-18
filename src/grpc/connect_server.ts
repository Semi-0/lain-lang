/**
 * Connect RPC server for LainViz (Compile + NetworkStream).
 * Protocol-agnostic decode via to_compile_request_data; same compile/stream logic as gRPC.
 */
import { ConnectRouter } from "@bufbuild/connect"
import { connectNodeAdapter } from "@connectrpc/connect-node"
import type { LexicalEnvironment } from "../../compiler/env/env"
import { CompileResponse, NetworkUpdate, StrongestValueLayer } from "./connect_generated/lain_pb.js"
import { LainViz } from "./connect_generated/lain_connect.js"
import { to_compile_request_data } from "./decode"
import { encode_network_update } from "./encode"
import type { NetworkUpdateData } from "./network_stream_handler"
import { bind_context_slots_io, compile_for_viz } from "./compile_handler"
import { subscribe_cell_updates } from "./network_stream_handler"
import { trace_compile_request_io, trace_network_stream_io } from "./tracer"

function toConnectNetworkUpdate(u: NetworkUpdateData): NetworkUpdate {
  const raw = encode_network_update(u)
  return new NetworkUpdate({
    cellId: raw.cellId,
    name: raw.name,
    strongestValue: new StrongestValueLayer({
      value: raw.strongestValue?.value ?? new Uint8Array(0),
      timestamp: BigInt(raw.strongestValue?.timestamp ?? 0),
      sourceId: raw.strongestValue?.sourceId ?? "",
    }),
  })
}

export function create_connect_routes(env: LexicalEnvironment): (router: ConnectRouter) => void {
  return (router: ConnectRouter) => {
    router.service(LainViz, {
      compile(req) {
        const data = to_compile_request_data(req)
        trace_compile_request_io(req, data)
        bind_context_slots_io(env, data)
        const result = compile_for_viz(data)
        return new CompileResponse({
          success: result.success,
          errorMessage: result.error_message ?? "",
        })
      },
      async *networkStream(req, context) {
        const data = to_compile_request_data(req)
        trace_network_stream_io(req, undefined, data)
        const queue: NetworkUpdate[] = []
        let wake = () => {}
        let closed = false
        context.signal?.addEventListener("abort", () => {
          closed = true
          wake()
        })
        const unsub = subscribe_cell_updates(data, (u: NetworkUpdateData) => {
          queue.push(toConnectNetworkUpdate(u))
          wake()
        })
        try {
          while (!closed || queue.length > 0) {
            if (queue.length > 0) {
              yield queue.shift()!
            } else {
              await new Promise<void>((r) => {
                wake = r
              })
            }
          }
        } finally {
          unsub()
        }
      },
    })
  }
}

export function create_connect_handler_io(env: LexicalEnvironment): ReturnType<typeof connectNodeAdapter> {
  return connectNodeAdapter({
    routes: create_connect_routes(env),
  })
}
