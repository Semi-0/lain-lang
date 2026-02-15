/**
 * Compile (unary) RPC handler. Decodes request, calls compile_for_viz, returns CompileResponse.
 */
import type { sendUnaryData, ServerUnaryCall } from "@grpc/grpc-js"
import type { CompileRequest, CompileResponse } from "./generated/lain"
import type { LexicalEnvironment } from "../../compiler/env/env"
import { decode_compile_request } from "./decode"
import { trace_compile_request_io } from "./tracer"

export type CompileResult = { success: boolean; error_message: string }

export function compile_for_viz(_data: Readonly<Record<string, { id: string; value: unknown }>>): CompileResult {
  return { success: true, error_message: "" }
}

export function bind_context_slots_io(
  _env: LexicalEnvironment,
  _data: Readonly<Record<string, { id: string; value: unknown }>>
): void {
  // Stub (Q3 deferred): no-op.
}

function to_grpc_response(r: CompileResult): CompileResponse {
  return { success: r.success, errorMessage: r.error_message ?? "" }
}

export function handle_compile_io(
  call: ServerUnaryCall<CompileRequest, CompileResponse>,
  callback: sendUnaryData<CompileResponse>,
  env: LexicalEnvironment
): void {
  const data = decode_compile_request(call.request)
  trace_compile_request_io(call.request, data)
  bind_context_slots_io(env, data)
  const result = compile_for_viz(data)
  callback(null, to_grpc_response(result))
}
