/**
 * Legacy unary Compile + grpc-js handler path.
 * **Lain-viz** does not call `Compile`; it uses `OpenSession`, `PushDeltas`, and `CardBuild` (see `proto/lain.proto` deprecations).
 * Uses pipe (Effect) and compose (generic_combinator) for sequential execution.
 */
import type { sendUnaryData, ServerUnaryCall } from "@grpc/grpc-js"
import type { CompileRequest, CompileResponse } from "../generated/lain"
import type { LexicalEnvironment } from "../../compiler/env/env"
import { pipe } from "effect"
import { compose } from "generic-handler/built_in_generics/generic_combinator"
import { decode_compile_request } from "../codec/decode"
import { trace_compile_request_io } from "../util/tracer"

export type CompileResult = { success: boolean; error_message: string }

/**
 * @deprecated Stub only. The Connect **Compile** RPC is deprecated for lain-viz; use **PushDeltas** + **CardBuild** for slot sync and per-card compile. Kept for legacy `handle_compile` / grpc-js `handle_compile_io` if re-enabled.
 */
export function compile_for_viz(_data: Readonly<Record<string, { id: string; value: unknown }>>): CompileResult {
  return { success: true, error_message: "" }
}

/**
 * Binds decoded slot map into `LexicalEnvironment` (deferred / Q3). **Still called** on the hot path after **OpenSession** and **PushDeltas** (`connect_server`, `session_combinator`); currently a no-op. Not the same lifecycle as deprecated unary **Compile** — only that RPC path is unused by the browser client.
 */
export function bind_context_slots_io(
  _env: LexicalEnvironment,
  _data: Readonly<Record<string, { id: string; value: unknown }>>
): void {
  // Stub (Q3 deferred): no-op.
}

function to_grpc_response(r: CompileResult): CompileResponse {
  return { success: r.success, errorMessage: r.error_message ?? "" }
}

/** Data → compile → gRPC response (sequential pipeline). */
const data_to_grpc_response = compose(compile_for_viz, to_grpc_response) as (
  data: Readonly<Record<string, { id: string; value: unknown }>>
) => CompileResponse

export function handle_compile_io(
  call: ServerUnaryCall<CompileRequest, CompileResponse>,
  callback: sendUnaryData<CompileResponse>,
  env: LexicalEnvironment
): void {
  const data = decode_compile_request(call.request)
  trace_compile_request_io(call.request, data)
  bind_context_slots_io(env, data)
  const response: CompileResponse = pipe(data, data_to_grpc_response)
  callback(null, response)
}
