import { expect, test, describe } from "bun:test"
import {
  subscribe_cell_updates,
  type NetworkUpdateData,
} from "../src/grpc/network_stream_handler"

describe("subscribe_cell_updates", () => {
  test("stub invokes callback with at least one NetworkUpdateData", (done) => {
    const callback = (u: NetworkUpdateData) => {
      expect(u).toHaveProperty("cell_id")
      expect(u).toHaveProperty("name")
      expect(u).toHaveProperty("strongest_value")
      expect(u.strongest_value).toHaveProperty("value")
      expect(u.strongest_value).toHaveProperty("timestamp")
      expect(u.strongest_value).toHaveProperty("source_id")
      done()
    }
    const unsub = subscribe_cell_updates(null, callback)
    expect(typeof unsub).toBe("function")
    unsub()
  })

  test("returns unsubscribe function that can be called without error", () => {
    const unsub = subscribe_cell_updates(null, () => {})
    expect(() => unsub()).not.toThrow()
  })
})
