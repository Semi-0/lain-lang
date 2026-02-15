/**
 * gRPC communication unit tests: real client calls in-process server.
 * Verifies bi-directional communication (client -> server -> response/stream).
 */
import { expect, test, describe, beforeAll, afterAll } from "bun:test"
import * as grpc from "@grpc/grpc-js"
import { LainVizClient } from "../src/grpc/generated/lain"
import { empty_lexical_environment } from "../compiler/env/env"
import { create_grpc_server_io } from "../src/grpc/server"

const TEST_PORT = 50052
let server: grpc.Server

beforeAll(() => {
  const env = empty_lexical_environment("grpc-test")
  server = create_grpc_server_io(TEST_PORT, env)
})

afterAll((done) => {
  if (server) {
    server.tryShutdown(() => done())
  } else {
    done()
  }
})

function wait(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

describe("gRPC communication", () => {
  test("Compile: client sends CompileRequest, server returns CompileResponse", async () => {
    await wait(200)
    const client = new LainVizClient(
      `localhost:${TEST_PORT}`,
      grpc.credentials.createInsecure()
    )
    const request = {
      data: {
        code: { id: "c1", value: new Uint8Array(0) },
      },
    }
    const res = await new Promise<{ success: boolean; errorMessage: string }>((resolve, reject) => {
      client.compile(request, (err, response) => {
        if (err) reject(err)
        else resolve(response!)
      })
    })
    expect(res).toBeDefined()
    expect(typeof res.success).toBe("boolean")
    expect(typeof res.errorMessage).toBe("string")
  })

  test("NetworkStream: client sends request, server sends at least one NetworkUpdate", async () => {
    await wait(100)
    const client = new LainVizClient(
      `localhost:${TEST_PORT}`,
      grpc.credentials.createInsecure()
    )
    const request = { data: {} }
    const updates: unknown[] = []
    const done = new Promise<void>((resolve, reject) => {
      const stream = client.networkStream(request)
      stream.on("data", (u: unknown) => {
        updates.push(u)
        if (updates.length >= 1) resolve()
      })
      stream.on("error", reject)
      stream.on("end", () => resolve())
    })
    await done
    expect(updates.length).toBeGreaterThanOrEqual(1)
    expect(updates[0]).toHaveProperty("cellId")
    expect(updates[0]).toHaveProperty("name")
    expect(updates[0]).toHaveProperty("strongestValue")
  })
})
