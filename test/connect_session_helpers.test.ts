/**
 * Unit tests for connect_session_helpers (delta_to_server_messages, open_session_initial_slot_map).
 */
import { expect, test, describe } from "bun:test"
import {
  delta_to_server_messages,
  open_session_initial_slot_map,
} from "../src/grpc/connect_session_helpers"
import { to_cards_delta_data } from "../src/grpc/decode"

describe("delta_to_server_messages", () => {
  test("returns heartbeat + CardUpdate per slot", () => {
    const decoded = to_cards_delta_data({
      slots: {
        "card-1code": {
          id: "card-1",
          value: new TextEncoder().encode(JSON.stringify("test")),
        },
      },
      remove: [],
    })
    const msgs = delta_to_server_messages(decoded)
    expect(msgs.length).toBe(2) // 1 heartbeat + 1 cardUpdate
    expect(msgs[0]!.kind?.case).toBe("heartbeat")
    expect(msgs[1]!.kind?.case).toBe("cardUpdate")
    expect((msgs[1]!.kind as { case: string; value: { cardId: string } }).value.cardId).toBe("card-1")
  })

  test("returns heartbeat + CardUpdate per remove key (ref null)", () => {
    const decoded = to_cards_delta_data({
      slots: {},
      remove: ["card-2code"],
    })
    const msgs = delta_to_server_messages(decoded)
    expect(msgs.length).toBe(2) // 1 heartbeat + 1 remove
    expect(msgs[0]!.kind?.case).toBe("heartbeat")
    expect(msgs[1]!.kind?.case).toBe("cardUpdate")
    expect((msgs[1]!.kind as { case: string; value: { cardId: string } }).value.cardId).toBe("card-2")
  })

  test("empty delta returns only heartbeat", () => {
    const decoded = to_cards_delta_data({ slots: {}, remove: [] })
    const msgs = delta_to_server_messages(decoded)
    expect(msgs.length).toBe(1)
    expect(msgs[0]!.kind?.case).toBe("heartbeat")
  })
})

describe("open_session_initial_slot_map", () => {
  test("empty initialData returns {}", () => {
    const result = open_session_initial_slot_map({})
    expect(Object.keys(result)).toHaveLength(0)
  })

  test("non-empty initialData returns slot map", () => {
    const initialData = {
      "card-1code": {
        id: "card-1",
        value: JSON.parse(JSON.stringify("hello")),
      },
    }
    const result = open_session_initial_slot_map(initialData)
    expect(Object.keys(result)).toHaveLength(1)
    expect(result["card-1code"]).toEqual({ id: "card-1", value: "hello" })
  })
})
