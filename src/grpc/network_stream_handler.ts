/**
 * NetworkStream (server streaming) RPC handler. Stub: subscribe_cell_updates emits fake updates.
 */
import type { ServerWritableStream } from "@grpc/grpc-js"
import type { CompileRequest, NetworkUpdate } from "./generated/lain"
import type { LexicalEnvironment } from "../../compiler/env/env"
import { decode_compile_request } from "./decode"
import { trace_network_stream_io } from "./tracer"
import { encode_network_update } from "./encode"

export type NetworkUpdateData = {
  readonly cell_id: string
  readonly name: string
  readonly strongest_value: {
    readonly value: unknown
    readonly timestamp: number
    readonly source_id: string
  }
}

export function subscribe_cell_updates(
  _cells: unknown,
  callback: (u: NetworkUpdateData) => void
): () => void {
  callback({
    cell_id: "stub",
    name: "stub",
    strongest_value: { value: null, timestamp: 0, source_id: "" },
  })
  return () => {}
}

export function handle_network_stream_io(
  call: ServerWritableStream<CompileRequest, NetworkUpdate>,
  _env: LexicalEnvironment
): void {
  const data = decode_compile_request(call.request)
  trace_network_stream_io(call.request)
  const unsub = subscribe_cell_updates(data, (u) => {
    call.write(encode_network_update(u))
  })
  call.on("cancelled", () => unsub())
  call.on("error", () => unsub())
  call.on("finish", () => unsub())
  // Stub emits one update then ends; real impl would keep stream open.
  setImmediate(() => call.end())
}
