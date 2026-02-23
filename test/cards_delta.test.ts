/**
 * Unit tests for Session protocol: CardsDelta decode, apply, key parsing.
 */
import { expect, test, describe } from "bun:test"
import { to_cards_delta_data } from "../src/grpc/codec/decode"
import { apply_cards_delta_to_slot_map } from "../src/grpc/delta/cards_delta_apply"
import { key_to_card_and_slot } from "../src/grpc/codec/session_encode"

function bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

describe("to_cards_delta_data", () => {
  test("decodes slots map with JSON value bytes", () => {
    const pb = {
      slots: {
        k1: { id: "c1", value: bytes(JSON.stringify("hello")) },
        k2: { id: "c2", value: bytes(JSON.stringify(42)) },
      },
      remove: [] as string[],
    }
    const { slots, remove } = to_cards_delta_data(pb)
    expect(slots.k1).toEqual({ id: "c1", value: "hello" })
    expect(slots.k2).toEqual({ id: "c2", value: 42 })
    expect(remove).toHaveLength(0)
  })

  test("decodes empty slots and remove list", () => {
    const { slots, remove } = to_cards_delta_data({})
    expect(Object.keys(slots)).toHaveLength(0)
    expect(remove).toHaveLength(0)
  })

  test("decodes remove list", () => {
    const { slots, remove } = to_cards_delta_data({
      slots: {},
      remove: ["c1::above", "c2code"],
    })
    expect(remove).toEqual(["c1::above", "c2code"])
  })
})

describe("apply_cards_delta_to_slot_map", () => {
  test("empty delta returns same map", () => {
    const map = { a: { id: "x", value: 1 } }
    const result = apply_cards_delta_to_slot_map({ slots: {}, remove: [] }, map)
    expect(result).toEqual(map)
  })

  test("set adds new key", () => {
    const map: Record<string, { readonly id: string; readonly value: unknown }> = {}
    const delta = {
      slots: { k: { id: "c1", value: "v" } },
      remove: [] as readonly string[],
    }
    const result = apply_cards_delta_to_slot_map(delta, map)
    expect(result.k).toEqual({ id: "c1", value: "v" })
  })

  test("set overwrites existing key", () => {
    const map = { k: { id: "c1", value: "old" } }
    const delta = {
      slots: { k: { id: "c1", value: "new" } },
      remove: [] as readonly string[],
    }
    const result = apply_cards_delta_to_slot_map(delta, map)
    expect(result.k).toEqual({ id: "c1", value: "new" })
  })

  test("remove deletes key", () => {
    const map = { k: { id: "c1", value: "x" } }
    const delta = { slots: {}, remove: ["k"] as readonly string[] }
    const result = apply_cards_delta_to_slot_map(delta, map)
    expect("k" in result).toBe(false)
  })

  test("apply then remove then set", () => {
    const map = { a: { id: "x", value: 1 } }
    const delta = {
      slots: { b: { id: "y", value: 2 }, a: { id: "x", value: 2 } },
      remove: ["a"] as readonly string[],
    }
    const result = apply_cards_delta_to_slot_map(delta, map)
    expect(result.a).toEqual({ id: "x", value: 2 })
    expect(result.b).toEqual({ id: "y", value: 2 })
  })
})

describe("key_to_card_and_slot", () => {
  test('"card-1code" -> card_id "card-1", slot "code"', () => {
    expect(key_to_card_and_slot("card-1code")).toEqual({ card_id: "card-1", slot: "code" })
  })

  test('"c1::this" -> card_id "c1", slot "::this"', () => {
    expect(key_to_card_and_slot("c1::this")).toEqual({ card_id: "c1", slot: "::this" })
  })

  test('"c1::above" -> card_id "c1", slot "::above"', () => {
    expect(key_to_card_and_slot("c1::above")).toEqual({ card_id: "c1", slot: "::above" })
  })

  test("unknown key format returns key as card_id, empty slot", () => {
    expect(key_to_card_and_slot("foo")).toEqual({ card_id: "foo", slot: "" })
  })
})
