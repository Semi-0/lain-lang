/**
 * Decode proto CompileRequest to internal data shape (bytes -> JSON for CardRef values).
 * Protocol-agnostic: to_compile_request_data accepts any { data: Record<..., { id?, value? }> }.
 * No import from generated/lain here so Connect server can run without loading ts-proto (protobuf 2.x).
 */
export type CardRefData = { readonly id: string; readonly value: unknown }
export type CompileRequestData = Readonly<Record<string, CardRefData>>

const decoder = new TextDecoder()

function decode_card_ref_value(bytes: Uint8Array): unknown {
  if (bytes.length === 0) return undefined
  return JSON.parse(decoder.decode(bytes)) as unknown
}

/** Protocol-agnostic: turns any request shape with data map (id, value bytes) into CompileRequestData. */
export function to_compile_request_data(
  request: { data?: Record<string, { id?: string; value?: Uint8Array }> }
): CompileRequestData {
  const data = request.data ?? {}
  const out: Record<string, CardRefData> = {}
  for (const [k, v] of Object.entries(data)) {
    if (v != null) {
      out[k] = {
        id: v.id ?? "",
        value: decode_card_ref_value(v.value ?? new Uint8Array(0)),
      }
    }
  }
  return out
}

/** Same as to_compile_request_data; kept for gRPC handler compatibility. */
export function decode_compile_request(
  pb: { data?: Record<string, { id?: string; value?: Uint8Array }> }
): CompileRequestData {
  return to_compile_request_data(pb)
}

/** Decode proto CardsDelta to slots (CompileRequestData) + remove keys. Protocol-agnostic shape. */
export function to_cards_delta_data(pb: {
  slots?: Record<string, { id?: string; value?: Uint8Array }>
  remove?: readonly string[]
}): { slots: CompileRequestData; remove: readonly string[] } {
  const slots = pb.slots ?? {}
  const out: Record<string, CardRefData> = {}
  for (const [k, v] of Object.entries(slots)) {
    if (v != null) {
      out[k] = {
        id: v.id ?? "",
        value: decode_card_ref_value(v.value ?? new Uint8Array(0)),
      }
    }
  }
  return { slots: out, remove: pb.remove ?? [] }
}

/** Decode OpenSessionRequest to sessionId + initialData. Uses to_compile_request_data for initialData. */
export function to_open_session_data(req: {
  sessionId?: string
  initialData?: { data?: Record<string, { id?: string; value?: Uint8Array }> }
}): { sessionId: string; initialData: CompileRequestData } {
  const initialData = req.initialData != null ? to_compile_request_data(req.initialData) : ({} as CompileRequestData)
  return {
    sessionId: req.sessionId ?? "",
    initialData,
  }
}

/** Decode PushDeltasRequest to sessionId + delta. Uses to_cards_delta_data for delta. */
export function to_push_deltas_data(req: {
  sessionId?: string
  delta?: { slots?: Record<string, { id?: string; value?: Uint8Array }>; remove?: readonly string[] }
}): { sessionId: string; delta: ReturnType<typeof to_cards_delta_data> } {
  const delta = req.delta != null ? to_cards_delta_data(req.delta) : { slots: {}, remove: [] as readonly string[] }
  return {
    sessionId: req.sessionId ?? "",
    delta,
  }
}
