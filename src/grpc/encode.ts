/**
 * Encode internal shapes to proto for server responses (e.g. NetworkUpdate).
 */
import type { NetworkUpdate as PbNetworkUpdate, StrongestValueLayer as PbStrongestValueLayer } from "./generated/lain"
import type { NetworkUpdateData } from "./network_stream_handler"

const encoder = new TextEncoder()

function encode_value(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value))
}

export function encode_network_update(u: NetworkUpdateData): PbNetworkUpdate {
  const layer: PbStrongestValueLayer = {
    value: encode_value(u.strongest_value.value),
    timestamp: u.strongest_value.timestamp,
    sourceId: u.strongest_value.source_id ?? "",
  }
  return {
    cellId: u.cell_id ?? "",
    name: u.name ?? "",
    strongestValue: layer,
  }
}
