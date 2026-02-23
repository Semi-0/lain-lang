import { describe, expect, test } from "bun:test"
import { create_runtime_output_bridge_io } from "../src/grpc/bridge/connect_bridge_minireactor"
import type { SessionState } from "../src/grpc/session/session_store"

function make_state(slotMap: Record<string, { id: string; value: unknown }> = {}): SessionState {
  return {
    slotMap,
    queue: [],
    resolveWait: null,
  }
}

describe("connect_bridge_minireactor", () => {
  test("forwards runtime output to session queue", () => {
    const state = make_state()
    const traces: string[] = []
    const bridge = create_runtime_output_bridge_io(state, (action) => {
      traces.push(action)
    })
    bridge.receive_io({
      cardId: "card-a",
      slot: "::this",
      value: 7,
    })
    expect(state.queue.length).toBe(1)
    expect(state.queue[0]?.kind?.case).toBe("cardUpdate")
    expect(traces).toContain("runtime_output_forwarded")
    bridge.dispose_io()
  })

  test("skips equal_state and equal_outbox duplicates", () => {
    const state = make_state({
      "card-b::this": { id: "card-b", value: 11 },
    })
    const traces: string[] = []
    const bridge = create_runtime_output_bridge_io(state, (action) => {
      traces.push(action)
    })
    bridge.receive_io({
      cardId: "card-b",
      slot: "::this",
      value: 11,
    })
    bridge.receive_io({
      cardId: "card-c",
      slot: "::this",
      value: "x",
    })
    bridge.receive_io({
      cardId: "card-c",
      slot: "::this",
      value: "x",
    })
    expect(traces).toContain("runtime_output_skipped_equal_state")
    expect(traces).toContain("runtime_output_skipped_equal_outbox")
    expect(state.queue.length).toBe(1)
    bridge.dispose_io()
  })

  test("dispose stops forwarding new events", () => {
    const state = make_state()
    const bridge = create_runtime_output_bridge_io(state, () => {})
    bridge.dispose_io()
    bridge.receive_io({
      cardId: "card-d",
      slot: "::this",
      value: 1,
    })
    expect(state.queue.length).toBe(0)
  })
})
