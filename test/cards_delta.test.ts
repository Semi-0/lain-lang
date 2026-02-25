/**
 * Unit tests for Session protocol: CardsDelta decode, apply, key parsing.
 */
import { expect, test, describe } from "bun:test"
import { to_cards_delta_data, normalize_decoded_value } from "../src/grpc/codec/decode"
import { apply_cards_delta_to_slot_map } from "../src/grpc/delta/cards_delta_apply"
import { key_to_card_and_slot } from "../src/grpc/codec/session_encode"

function bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

describe("normalize_decoded_value", () => {
  test("leaves null and undefined unchanged", () => {
    expect(normalize_decoded_value(null)).toBe(null)
    expect(normalize_decoded_value(undefined)).toBe(undefined)
  })

  test("leaves number unchanged", () => {
    expect(normalize_decoded_value(42)).toBe(42)
    expect(normalize_decoded_value(0)).toBe(0)
    expect(normalize_decoded_value(-1.5)).toBe(-1.5)
  })

  test("converts numeric strings to number", () => {
    expect(normalize_decoded_value("1")).toBe(1)
    expect(normalize_decoded_value("42")).toBe(42)
    expect(normalize_decoded_value("3.14")).toBe(3.14)
    expect(normalize_decoded_value("-1")).toBe(-1)
    expect(normalize_decoded_value("0")).toBe(0)
  })

  test("leaves non-numeric strings unchanged", () => {
    expect(normalize_decoded_value("hello")).toBe("hello")
    expect(normalize_decoded_value("")).toBe("")
    expect(normalize_decoded_value("1a")).toBe("1a")
  })

  test("converts #t and #f to boolean", () => {
    expect(normalize_decoded_value("#t")).toBe(true)
    expect(normalize_decoded_value("#f")).toBe(false)
  })

  test("leaves JSON boolean unchanged", () => {
    expect(normalize_decoded_value(true)).toBe(true)
    expect(normalize_decoded_value(false)).toBe(false)
  })

  test("normalizes LayeredObject base when #t or #f", () => {
    expect(normalize_decoded_value({ base: "#t", vector_clock: {} })).toEqual({
      base: true,
      vector_clock: {},
    })
    expect(normalize_decoded_value({ base: "#f" })).toEqual({ base: false })
  })

  test("leaves plain objects without base unchanged", () => {
    const obj = { foo: "bar", n: 1 }
    expect(normalize_decoded_value(obj)).toEqual(obj)
  })

  test("leaves arrays unchanged", () => {
    expect(normalize_decoded_value([1, 2])).toEqual([1, 2])
  })
})

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

  test("normalizes #t and #f in slot values to boolean", () => {
    const pb = {
      slots: {
        "c1::this": { id: "x", value: bytes(JSON.stringify("#t")) },
        "c2code": { id: "y", value: bytes(JSON.stringify("#f")) },
      },
      remove: [] as string[],
    }
    const { slots } = to_cards_delta_data(pb)
    expect(slots["c1::this"].value).toBe(true)
    expect(slots["c2code"].value).toBe(false)
  })

  test("converts numeric string to number in PushDeltas", () => {
    const pb = {
      slots: { k: { id: "x", value: bytes(JSON.stringify("1")) } },
      remove: [] as string[],
    }
    const { slots } = to_cards_delta_data(pb)
    expect(slots.k).toEqual({ id: "x", value: 1 })
  })

  test("decodes boolean, number, string in PushDeltas", () => {
    const pb = {
      slots: {
        a: { id: "id1", value: bytes(JSON.stringify(true)) },
        b: { id: "id2", value: bytes(JSON.stringify(123)) },
        c: { id: "id3", value: bytes(JSON.stringify("text")) },
      },
      remove: [] as string[],
    }
    const { slots } = to_cards_delta_data(pb)
    expect(slots.a).toEqual({ id: "id1", value: true })
    expect(slots.b).toEqual({ id: "id2", value: 123 })
    expect(slots.c).toEqual({ id: "id3", value: "text" })
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
