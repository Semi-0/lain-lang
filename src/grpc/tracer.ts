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
  console.log("[grpc] Compile request", { req: _req, data: _data })
}

export function trace_network_stream_io(_req: unknown, _update?: unknown): void {
  console.log("[grpc] NetworkStream received")
  if (!enabled("DEBUG_GRPC")) return
  console.log("[grpc] NetworkStream", { req: _req, update: _update })
}
