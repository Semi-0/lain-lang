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
