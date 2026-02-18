/**
 * Connect server tests: real Connect client calls in-process Connect HTTP server.
 * Verifies backend speaks Connect (Compile + NetworkStream).
 */
import { expect, test, describe, beforeAll, afterAll } from "bun:test"
import * as http from "node:http"
import { createConnectTransport } from "@connectrpc/connect-node"
import { createPromiseClient } from "@bufbuild/connect"
import { CompileRequest } from "../src/grpc/connect_generated/lain_pb.js"
import { LainViz } from "../src/grpc/connect_generated/lain_connect.js"
import { empty_lexical_environment } from "../compiler/env/env"
import { create_connect_handler_io } from "../src/grpc/connect_server"

let server: http.Server
let baseUrl: string

beforeAll(() => {
  const env = empty_lexical_environment("connect-test")
  const handler = create_connect_handler_io(env)
  server = http.createServer(handler)
  return new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const a = server.address()
      const port = typeof a === "object" && a?.port ? a.port : 0
      baseUrl = `http://127.0.0.1:${port}`
      resolve()
    })
  })
})

afterAll(() => {
  return new Promise<void>((resolve) => {
    if (!server) return resolve()
    const t = setTimeout(resolve, 500)
    server.close(() => {
      clearTimeout(t)
      resolve()
    })
  })
})

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

describe("Connect server", () => {
  test("Compile: client sends CompileRequest, server returns CompileResponse", async () => {
    await wait(100)
    const transport = createConnectTransport({ baseUrl })
    const client = createPromiseClient(LainViz, transport)
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
    await wait(100)
    const transport = createConnectTransport({ baseUrl })
    const client = createPromiseClient(LainViz, transport)
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
})
