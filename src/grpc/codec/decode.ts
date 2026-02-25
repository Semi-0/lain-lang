/**
 * Decode proto CompileRequest to internal data shape (bytes -> JSON for CardRef values).
 * Protocol-agnostic: to_compile_request_data accepts any { data: Record<..., { id?, value? }> }.
 * No import from generated/lain here so Connect server can run without loading ts-proto (protobuf 2.x).
 */
export type CardRefData = { readonly id: string; readonly value: unknown }
export type CompileRequestData = Readonly<Record<string, CardRefData>>

const decoder = new TextDecoder()

/** Lain/Scheme-style boolean literals. */
const LAIN_TRUE = "#t"
const LAIN_FALSE = "#f"

/**
 * Normalize decoded value: coerce Lain-style #t/#f to boolean, preserve string/number/boolean.
 * Used for PushDeltas and CompileRequest value bytes so primitives are properly typed.
 */
export function normalize_decoded_value(value: unknown): unknown {
  if (value === null || value === undefined) return value
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value
  if (typeof value === "string") {
    if (value === LAIN_TRUE) return true
    if (value === LAIN_FALSE) return false
    const n = Number(value)
    if (value.trim() !== "" && !Number.isNaN(n)) return n
    return value
  }
  if (typeof value === "object" && value !== null && "base" in value) {
    const obj = value as { base?: unknown }
    const base = obj.base
    if (base === LAIN_TRUE) return { ...obj, base: true }
    if (base === LAIN_FALSE) return { ...obj, base: false }
  }
  return value
}

function decode_card_ref_value(bytes: Uint8Array): unknown {
  if (bytes.length === 0) return undefined
  const parsed = JSON.parse(decoder.decode(bytes)) as unknown
  return normalize_decoded_value(parsed)
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

/** Decode CardBuildRequest to sessionId + cardId. */
export function to_card_build_data(req: {
  sessionId?: string
  cardId?: string
}): { sessionId: string; cardId: string } {
  return {
    sessionId: req.sessionId ?? "",
    cardId: req.cardId ?? "",
  }
}
