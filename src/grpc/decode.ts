/**
 * Decode proto CompileRequest to internal data shape (bytes -> JSON for CardRef values).
 */
import type { CompileRequest as PbCompileRequest, CardRef as PbCardRef } from "./generated/lain"

export type CardRefData = { readonly id: string; readonly value: unknown }
export type CompileRequestData = Readonly<Record<string, CardRefData>>

const decoder = new TextDecoder()

function decode_card_ref_value(bytes: Uint8Array): unknown {
  if (bytes.length === 0) return undefined
  return JSON.parse(decoder.decode(bytes)) as unknown
}

function decode_card_ref(pb: PbCardRef): CardRefData {
  return {
    id: pb.id ?? "",
    value: decode_card_ref_value(pb.value ?? new Uint8Array(0)),
  }
}

export function decode_compile_request(pb: PbCompileRequest): CompileRequestData {
  const data = pb.data ?? {}
  const out: Record<string, CardRefData> = {}
  for (const [k, v] of Object.entries(data)) {
    if (v != null) {
      out[k] = decode_card_ref(v)
    }
  }
  return out
}
