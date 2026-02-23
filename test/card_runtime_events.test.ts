import { describe, expect, test } from "bun:test"
import {
  emit_runtime_card_output_io,
  subscribe_runtime_card_output,
  type RuntimeCardOutputEvent,
} from "../src/grpc/bridge/card_runtime_events"

describe("card_runtime_events", () => {
  test("subscriber receives emitted event", () => {
    const received: RuntimeCardOutputEvent[] = []
    const unsubscribe = subscribe_runtime_card_output((event) => {
      received.push(event)
    })
    emit_runtime_card_output_io({
      cardId: "card-1",
      slot: "::this",
      value: 123,
    })
    unsubscribe()
    expect(received.length).toBe(1)
    expect(received[0]?.cardId).toBe("card-1")
  })

  test("unsubscribe stops callback delivery", () => {
    const received: RuntimeCardOutputEvent[] = []
    const unsubscribe = subscribe_runtime_card_output((event) => {
      received.push(event)
    })
    unsubscribe()
    emit_runtime_card_output_io({
      cardId: "card-2",
      slot: "::this",
      value: 456,
    })
    expect(received.length).toBe(0)
  })
})
