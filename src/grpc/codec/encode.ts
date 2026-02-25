/**
 * Encode internal shapes to proto for server responses (e.g. NetworkUpdate).
 */
import type { NetworkUpdate as PbNetworkUpdate, StrongestValueLayer as PbStrongestValueLayer } from "../generated/lain"
import type { LayeredObject } from "sando-layer/Basic/LayeredObject"
import { is_layered_object } from "sando-layer/Basic/LayeredObject"
import { json_layered_object_serializer } from "sando-layer/Basic/LayeredSerializer"

export type NetworkUpdateData = {
  readonly cell_id: string
  readonly name: string
  readonly strongest_value: {
    readonly value: unknown
    readonly timestamp: number
    readonly source_id: string
  }
}

const encoder = new TextEncoder()

function encode_value(value: unknown): Uint8Array {
  const json = is_layered_object(value)
    ? json_layered_object_serializer(value as LayeredObject<unknown>)
    : JSON.stringify(value)
  return encoder.encode(json)
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
