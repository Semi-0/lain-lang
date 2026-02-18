import { to_string } from "generic-handler/built_in_generics/generic_conversation"

/**
 * Togglable tracers for gRPC (DEBUG_GRPC, DEBUG_COMPILE). No PII; off by default.
 */
function enabled(name: string): boolean {
  const v = typeof process !== "undefined" && process.env?.[name]
  return v === "1" || v === "true"
}

export function trace_compile_request_io(
  _req: unknown,
  _data: unknown
): void {
  console.log("[grpc] Compile request received")
  if (!enabled("DEBUG_GRPC") && !enabled("DEBUG_COMPILE")) return
  // Log decoded data so slot values are readable (not base64 bytes)
  if (_data != null) {
    console.log("[grpc] Compile request (decoded)", { data: to_string(_data) })
  } else {
    console.log("[grpc] Compile request", { req: to_string(_req) })
  }
}

export function trace_network_stream_io(
  _req: unknown,
  _update?: unknown,
  _decoded?: unknown
): void {
  console.log("[grpc] NetworkStream received")
  if (!enabled("DEBUG_GRPC")) return
  // Prefer decoded request so slot values are readable (not base64 bytes)
  if (_decoded != null) {
    console.log("[grpc] NetworkStream (decoded)", { data: to_string(_decoded) })
  } else {
    console.log("[grpc] NetworkStream", { req: to_string(_req), update: to_string(_update) })
  }
}
