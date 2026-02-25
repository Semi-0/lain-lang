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

export function trace_open_session_io(_req: unknown, _data?: unknown): void {
  console.log("[grpc] OpenSession received")
  if (!enabled("DEBUG_GRPC")) return
  if (_data != null) {
    console.log("[grpc] OpenSession (decoded)", { data: to_string(_data) })
  } else {
    console.log("[grpc] OpenSession", { req: to_string(_req) })
  }
}

export function trace_card_build_io(_req: unknown, _data?: { sessionId?: string; cardId?: string }): void {
  console.log("[grpc] CardBuild received")
  if (!enabled("DEBUG_GRPC") && !enabled("DEBUG_COMPILE")) return
  if (_data != null) {
    console.log("[grpc] CardBuild (decoded)", _data)
  }
}

export function trace_push_deltas_io(_req: unknown, _data?: unknown): void {
  const d = _data as { slotCount?: number; removeCount?: number } | undefined
  const empty = d != null && (d.slotCount ?? 0) === 0 && (d.removeCount ?? 0) === 0
  if (empty) return
  console.log("[grpc] PushDeltas received")
  if (!enabled("DEBUG_GRPC")) return
  if (_data != null) {
    console.log("[grpc] PushDeltas (decoded)", { data: to_string(_data) })
  } else {
    console.log("[grpc] PushDeltas", { req: to_string(_req) })
  }
}

export function trace_card_events_io(_source: string, _events: unknown): void {
  if (!enabled("DEBUG_GRPC") && !enabled("DEBUG_COMPILE")) return
  if (_source === "push_deltas" && Array.isArray(_events) && _events.length === 0) return
  console.log("[grpc] Card events", {
    source: _source,
    events: to_string(_events),
  })
}

export function trace_runtime_output_io(
  _action: string,
  _data: unknown
): void {
  if (!enabled("DEBUG_GRPC") && !enabled("DEBUG_COMPILE")) return
  console.log("[grpc] Runtime output", {
    action: _action,
    data: to_string(_data),
  })
}

/** Card runtime lifecycle: add, build, update, remove, connect, detach. */
export function trace_card_runtime_io(
  event: string,
  payload: Record<string, unknown>
): void {
  if (!enabled("DEBUG_GRPC") && !enabled("DEBUG_COMPILE")) return
  console.log("[grpc] Card runtime", { event, ...payload })
}

/** Summarize a ServerMessage for logging (heartbeat vs cardUpdate key/ref). */
function summarize_server_message(msg: { kind?: { case?: string; value?: unknown } }): string {
  const k = msg.kind?.case
  if (k === "heartbeat") return "heartbeat"
  if (k === "cardUpdate") {
    const cu = msg.kind?.value as { cardId?: string; slot?: string; ref?: unknown } | undefined
    const key = cu ? `${cu.cardId ?? "?"}${cu.slot ?? ""}` : "?"
    return `cardUpdate ${key} ${cu?.ref != null ? "set" : "remove"}`
  }
  return String(k ?? "?")
}

/** Log when messages are pushed to a session queue (DEBUG_GRPC). */
export function trace_session_push_io(
  sessionId: string | undefined,
  messages: readonly { kind?: { case?: string; value?: unknown } }[]
): void {
  if (!enabled("DEBUG_GRPC")) return
  if (messages.length === 0) return
  const summary = messages.map(summarize_server_message).join(", ")
  console.log("[grpc] OpenSession queue push", { sessionId: sessionId ?? "?", messages: summary })
}

/** Log when a message is yielded to the OpenSession client (DEBUG_GRPC). */
export function trace_open_session_yield_io(
  sessionId: string,
  msg: { kind?: { case?: string; value?: unknown } }
): void {
  if (!enabled("DEBUG_GRPC")) return
  console.log("[grpc] OpenSession yield to client", { sessionId, message: summarize_server_message(msg) })
}
