/**
 * Unit tests for OpenSession + PushDeltas: decode (to_open_session_data, to_push_deltas_data) and session store.
 */
import { expect, test, describe } from "bun:test"
import { to_open_session_data, to_push_deltas_data } from "../src/grpc/decode"
import {
  get_or_create_session,
  get_session,
  remove_session,
  session_push,
  wait_for_message_or_timeout,
} from "../src/grpc/session_store"
import { to_heartbeat_message } from "../src/grpc/session_encode"

function bytes(s: string): Uint8Array {
  return new TextEncoder().encode(s)
}

describe("to_open_session_data", () => {
  test("decodes sessionId and empty initialData", () => {
    const out = to_open_session_data({ sessionId: "s1" })
    expect(out.sessionId).toBe("s1")
    expect(Object.keys(out.initialData)).toHaveLength(0)
  })

  test("decodes initialData as CompileRequestData", () => {
    const out = to_open_session_data({
      sessionId: "s2",
      initialData: {
        data: {
          k1: { id: "c1", value: bytes(JSON.stringify("v1")) },
        },
      },
    })
    expect(out.sessionId).toBe("s2")
    expect(out.initialData.k1).toEqual({ id: "c1", value: "v1" })
  })
})

describe("to_push_deltas_data", () => {
  test("decodes sessionId and delta", () => {
    const out = to_push_deltas_data({
      sessionId: "s1",
      delta: {
        slots: { k1: { id: "c1", value: bytes(JSON.stringify(1)) } },
        remove: [],
      },
    })
    expect(out.sessionId).toBe("s1")
    expect(out.delta.slots.k1).toEqual({ id: "c1", value: 1 })
    expect(out.delta.remove).toHaveLength(0)
  })

  test("decodes empty delta when delta missing", () => {
    const out = to_push_deltas_data({ sessionId: "s2" })
    expect(out.sessionId).toBe("s2")
    expect(Object.keys(out.delta.slots)).toHaveLength(0)
    expect(out.delta.remove).toHaveLength(0)
  })
})

describe("session_store", () => {
  test("get_or_create_session creates and get_session returns it", () => {
    const id = "test-session-1"
    remove_session(id)
    const state = get_or_create_session(id, { a: { id: "x", value: 1 } })
    expect(state.slotMap.a).toEqual({ id: "x", value: 1 })
    expect(get_session(id)).toBe(state)
    remove_session(id)
    expect(get_session(id)).toBeUndefined()
  })

  test("session_push enqueues and wait_for_message_or_timeout resolves true", async () => {
    const id = "test-session-2"
    remove_session(id)
    const state = get_or_create_session(id, {})
    const msg = to_heartbeat_message()
    const waitPromise = wait_for_message_or_timeout(state, 50)
    session_push(state, msg)
    const hasMessage = await waitPromise
    expect(hasMessage).toBe(true)
    expect(state.queue.length).toBe(1)
    expect(state.queue[0]).toBe(msg)
    remove_session(id)
  })

  test("wait_for_message_or_timeout resolves false after ms when no push", async () => {
    const id = "test-session-3"
    remove_session(id)
    const state = get_or_create_session(id, {})
    const hasMessage = await wait_for_message_or_timeout(state, 20)
    expect(hasMessage).toBe(false)
    remove_session(id)
  })
})
