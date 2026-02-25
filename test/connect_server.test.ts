/**
 * Connect server tests: in-process Connect router transport (no TCP socket binding).
 * Verifies backend speaks Connect (Compile + NetworkStream, OpenSession + PushDeltas).
 */
import { expect, test, describe, beforeAll, afterAll } from "bun:test"
import { createPromiseClient, createRouterTransport } from "@bufbuild/connect"
import {
  CardBuildRequest,
  CardRef,
  CardsDelta,
  CompileRequest,
  OpenSessionRequest,
  PushDeltasRequest,
} from "../src/grpc/connect_generated/lain_pb.js"
import { LainViz } from "../src/grpc/connect_generated/lain_connect.js"
import { empty_lexical_environment } from "../compiler/env/env"
import { create_connect_routes } from "../src/grpc/connect_server"
import { runtime_get_card } from "../src/grpc/card/card_api"
import { emit_runtime_card_output_io } from "../src/grpc/bridge/card_runtime_events"

let client: ReturnType<typeof createPromiseClient<typeof LainViz>>

beforeAll(() => {
  const env = empty_lexical_environment("connect-test")
  const transport = createRouterTransport(create_connect_routes(env))
  client = createPromiseClient(LainViz, transport)
})

afterAll(() => {
  // no-op
})

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

describe("Connect server", () => {
  test("Compile: client sends CompileRequest, server returns CompileResponse", async () => {
    const request = new CompileRequest({
      data: {
        code: { id: "c1", value: new Uint8Array(0) },
      },
    })
    const res = await client.compile(request)
    expect(res).toBeDefined()
    expect(typeof res.success).toBe("boolean")
    expect(typeof res.errorMessage).toBe("string")
  })

  test("NetworkStream: client can open stream and receive zero or more updates", async () => {
    const request = new CompileRequest({ data: {} })
    const updates: unknown[] = []
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 500)
    try {
      for await (const u of client.networkStream(request, { signal: controller.signal })) {
        updates.push(u)
      }
    } catch {
      // Abort (canceled) or stream error is expected when we timeout
    } finally {
      clearTimeout(timeout)
    }
    expect(Array.isArray(updates)).toBe(true)
    if (updates.length > 0) {
      const first = updates[0] as { cellId?: string; name?: string; strongestValue?: unknown }
      expect(first).toHaveProperty("cellId")
      expect(first).toHaveProperty("name")
      expect(first).toHaveProperty("strongestValue")
    }
  })

  test.skip("Session (bidi): client sends delta stream, server yields Heartbeat + CardUpdate (HTTP/1.1 does not support BiDi)", async () => {
    async function* deltaStream() {
      yield new CardsDelta({
        slots: {
          "card-1code": new CardRef({
            id: "card-1",
            value: new TextEncoder().encode(JSON.stringify("test")),
          }),
        },
        remove: [],
      })
    }
    const received: { kind: string }[] = []
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 800)
    try {
      for await (const msg of client.session(deltaStream(), { signal: controller.signal })) {
        received.push({ kind: msg.kind?.case ?? "unknown" })
      }
    } catch {
      // Abort when we timeout
    } finally {
      clearTimeout(timeout)
    }
    const heartbeats = received.filter((r) => r.kind === "heartbeat")
    const cardUpdates = received.filter((r) => r.kind === "cardUpdate")
    expect(heartbeats.length).toBeGreaterThanOrEqual(1)
    expect(cardUpdates.length).toBeGreaterThanOrEqual(1)
  })

  test("OpenSession + PushDeltas: client sends delta, backend receives (no echo; propagation yields CardUpdate)", async () => {
    const sessionId = "test-session-" + Date.now()
    const openReq = new OpenSessionRequest({ sessionId })
    const received: { kind: string }[] = []
    const controller = new AbortController()
    const streamPromise = (async () => {
      try {
        for await (const msg of client.openSession(openReq, { signal: controller.signal })) {
          const case_ = msg.kind?.case ?? "unknown"
          received.push({ kind: case_ })
        }
      } catch {
        // Abort or stream end
      }
    })()
    await wait(150)
    const delta = new CardsDelta({
      slots: {
        "card-1code": new CardRef({
          id: "card-1",
          value: new TextEncoder().encode(JSON.stringify("hello")),
        }),
      },
      remove: [],
    })
    const pushReq = new PushDeltasRequest({ sessionId, delta })
    const empty = await client.pushDeltas(pushReq)
    expect(empty).toBeDefined()
    await wait(200)
    controller.abort()
    await streamPromise
    const heartbeats = received.filter((r) => r.kind === "heartbeat")
    expect(heartbeats.length).toBeGreaterThanOrEqual(1)
    /* We no longer echo the delta; CardUpdates come only from propagation (bridge). */
  })

  test("CardBuild: builds a card in session context", async () => {
    const sessionId = "test-session-build-" + Date.now()

    const openReq = new OpenSessionRequest({ sessionId })
    const controller = new AbortController()
    const streamPromise = (async () => {
      try {
        for await (const _ of client.openSession(openReq, { signal: controller.signal })) {
          // keep stream alive
        }
      } catch {
        // Abort or stream end
      }
    })()

    await wait(120)

    const delta = new CardsDelta({
      slots: {
        "card-build-1code": new CardRef({
          id: "card-build-1",
          value: new TextEncoder().encode(JSON.stringify("(+ 1 2 out)")),
        }),
      },
      remove: [],
    })
    await client.pushDeltas(new PushDeltasRequest({ sessionId, delta }))

    const res = await client.cardBuild(
      new CardBuildRequest({
        sessionId,
        cardId: "card-build-1",
      })
    )
    expect(res.success).toBe(true)
    expect(res.errorMessage).toBe("")

    controller.abort()
    await streamPromise
  })

  test("PushDeltas: connect auto-builds missing cards", async () => {
    const sessionId = "test-session-connect-build-" + Date.now()
    const cardA = "auto-build-a-" + Date.now()
    const cardB = "auto-build-b-" + Date.now()
    const openReq = new OpenSessionRequest({ sessionId })
    const controller = new AbortController()
    const streamPromise = (async () => {
      try {
        for await (const _ of client.openSession(openReq, { signal: controller.signal })) {
          // keep stream alive
        }
      } catch {
        // ignore abort
      }
    })()
    await wait(120)

    const delta = new CardsDelta({
      slots: {
        [`${cardA}::right`]: new CardRef({ id: cardB, value: new Uint8Array(0) }),
        [`${cardB}::left`]: new CardRef({ id: cardA, value: new Uint8Array(0) }),
      },
      remove: [],
    })
    await client.pushDeltas(new PushDeltasRequest({ sessionId, delta }))

    expect(runtime_get_card(cardA)).toBeDefined()
    expect(runtime_get_card(cardB)).toBeDefined()

    controller.abort()
    await streamPromise
  })

  test("PushDeltas: code-only delta does not build missing card", async () => {
    const sessionId = "test-session-code-skip-" + Date.now()
    const cardId = "code-only-" + Date.now()
    const openReq = new OpenSessionRequest({ sessionId })
    const controller = new AbortController()
    const streamPromise = (async () => {
      try {
        for await (const _ of client.openSession(openReq, { signal: controller.signal })) {
          // keep stream alive
        }
      } catch {
        // ignore abort
      }
    })()
    await wait(120)

    const delta = new CardsDelta({
      slots: {
        [`${cardId}code`]: new CardRef({
          id: cardId,
          value: new TextEncoder().encode(JSON.stringify("(+ 1 2 out)")),
        }),
      },
      remove: [],
    })
    await client.pushDeltas(new PushDeltasRequest({ sessionId, delta }))

    expect(runtime_get_card(cardId)).toBeUndefined()

    controller.abort()
    await streamPromise
  })

  test("OpenSession: runtime output event is forwarded as CardUpdate(::this)", async () => {
    const sessionId = "test-session-runtime-forward-" + Date.now()
    const openReq = new OpenSessionRequest({ sessionId })
    const controller = new AbortController()
    const received: { kind: string; cardId?: string; slot?: string }[] = []
    const streamPromise = (async () => {
      try {
        for await (const msg of client.openSession(openReq, { signal: controller.signal })) {
          const case_ = msg.kind?.case ?? "unknown"
          if (case_ === "cardUpdate") {
            const update = msg.kind.value
            received.push({
              kind: case_,
              cardId: update.cardId,
              slot: update.slot,
            })
          } else {
            received.push({ kind: case_ })
          }
        }
      } catch {
        // ignore abort
      }
    })()

    await wait(120)
    emit_runtime_card_output_io({
      cardId: "runtime-card-1",
      slot: "::this",
      value: 42,
    })
    await wait(120)
    controller.abort()
    await streamPromise

    const updates = received.filter(
      (message) =>
        message.kind === "cardUpdate" &&
        message.cardId === "runtime-card-1" &&
        message.slot === "::this"
    )
    expect(updates.length).toBeGreaterThanOrEqual(1)
  })

  test("OpenSession: runtime output dedupes identical outbox values", async () => {
    const sessionId = "test-session-runtime-dedupe-" + Date.now()
    const openReq = new OpenSessionRequest({ sessionId })
    const controller = new AbortController()
    const received: { kind: string; cardId?: string; slot?: string }[] = []
    const streamPromise = (async () => {
      try {
        for await (const msg of client.openSession(openReq, { signal: controller.signal })) {
          const case_ = msg.kind?.case ?? "unknown"
          if (case_ === "cardUpdate") {
            const update = msg.kind.value
            received.push({
              kind: case_,
              cardId: update.cardId,
              slot: update.slot,
            })
          }
        }
      } catch {
        // ignore abort
      }
    })()

    await wait(120)
    emit_runtime_card_output_io({
      cardId: "runtime-card-dup",
      slot: "::this",
      value: "same",
    })
    emit_runtime_card_output_io({
      cardId: "runtime-card-dup",
      slot: "::this",
      value: "same",
    })
    await wait(160)
    controller.abort()
    await streamPromise

    const updates = received.filter(
      (message) =>
        message.kind === "cardUpdate" &&
        message.cardId === "runtime-card-dup" &&
        message.slot === "::this"
    )
    expect(updates.length).toBe(1)
  })
})
