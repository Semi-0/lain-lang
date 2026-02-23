/**
 * NetworkStream (server streaming) RPC handler. Stub: subscribe_cell_updates emits fake updates.
 * cell_updates_iterable exposes updates as an async iterable (push bridge over subscribe_cell_updates).
 */
import type { ServerWritableStream } from "@grpc/grpc-js"
import type { CompileRequest, NetworkUpdate } from "../generated/lain"
import type { LexicalEnvironment } from "../../compiler/env/env"
import { decode_compile_request } from "../codec/decode"
import { trace_network_stream_io } from "../util/tracer"
import { encode_network_update, type NetworkUpdateData } from "../codec/encode"
import { create_push_to_async_iterable } from "../util/push_to_async_iterable"

export type { NetworkUpdateData } from "../codec/encode"

const HEARTBEAT_INTERVAL_MS = 2000

/** Pure: returns the canonical heartbeat payload. Single place for the convention. */
export function heartbeat_update_data(): NetworkUpdateData {
  return {
    cell_id: "heartbeat",
    name: "heartbeat",
    strongest_value: {
      value: null,
      timestamp: Date.now(),
      source_id: "",
    },
  }
}

function start_heartbeat_interval_io(
  callback: (u: NetworkUpdateData) => void,
  interval_ms: number
): () => void {
  const id = setInterval(() => callback(heartbeat_update_data()), interval_ms)
  return () => clearInterval(id)
}

/** Subscribes to cell updates; currently emits heartbeats every HEARTBEAT_INTERVAL_MS. Returns unsub that stops callbacks. */
export function subscribe_cell_updates(
  _cells: unknown,
  callback: (u: NetworkUpdateData) => void
): () => void {
  return start_heartbeat_interval_io(callback, HEARTBEAT_INTERVAL_MS)
}

/**
 * Stream of cell updates for the given request data. Uses subscribe_cell_updates internally;
 * closes when signal aborts. Unsubscribes when the iterable is done (consumer stops or close).
 */
export async function* cell_updates_iterable(
  data: Parameters<typeof subscribe_cell_updates>[0],
  signal?: AbortSignal
): AsyncGenerator<NetworkUpdateData> {
  const { push, close, iterable } = create_push_to_async_iterable<NetworkUpdateData>()
  signal?.addEventListener("abort", close)
  const unsub = subscribe_cell_updates(data, push)
  try {
    yield* iterable
  } finally {
    unsub()
  }
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
}
