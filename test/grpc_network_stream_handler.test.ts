import { expect, test, describe } from "bun:test"
import { subscribe_cell_updates } from "../src/grpc/handlers/network_stream_handler"

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

describe("subscribe_cell_updates", () => {
  test("returns unsubscribe function", () => {
    const unsub = subscribe_cell_updates(null, () => {})
    expect(typeof unsub).toBe("function")
    unsub()
  })

  test("returns unsubscribe function that can be called without error", () => {
    const unsub = subscribe_cell_updates(null, () => {})
    expect(() => unsub()).not.toThrow()
  })

  test("invokes callback at least once with heartbeat (cell_id === 'heartbeat') within 2.5s", async () => {
    const received: { cell_id: string }[] = []
    const unsub = subscribe_cell_updates(null, (u) => received.push({ cell_id: u.cell_id }))
    await wait(2500)
    unsub()
    expect(received.length).toBeGreaterThanOrEqual(1)
    expect(received.every((r) => r.cell_id === "heartbeat")).toBe(true)
  })

  test("unsub stops further callbacks", async () => {
    const received: { cell_id: string }[] = []
    const unsub = subscribe_cell_updates(null, (u) => received.push({ cell_id: u.cell_id }))
    await wait(500)
    unsub()
    const count_after_unsub = received.length
    await wait(2500)
    expect(received.length).toBe(count_after_unsub)
  })
})
