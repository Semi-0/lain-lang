/**
 * Encode internal shapes to proto for server responses (e.g. NetworkUpdate).
 */
import type { NetworkUpdate as PbNetworkUpdate, StrongestValueLayer as PbStrongestValueLayer } from "../generated/lain"
import { encode_value } from "./session_encode.js"

export type NetworkUpdateData = {
  readonly cell_id: string
  readonly name: string
  readonly strongest_value: {
    readonly value: unknown
    readonly timestamp: number
    readonly source_id: string
  }
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
