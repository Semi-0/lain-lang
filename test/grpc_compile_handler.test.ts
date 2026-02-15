import { expect, test, describe } from "bun:test"
import {
  compile_for_viz,
  handle_compile_io,
  type CompileResult,
} from "../src/grpc/compile_handler"
import type { sendUnaryData, ServerUnaryCall } from "@grpc/grpc-js"
import type { CompileRequest, CompileResponse } from "../src/grpc/generated/lain"
import { empty_lexical_environment } from "../compiler/env/env"

describe("compile_for_viz", () => {
  test("returns success and empty error_message by default", () => {
    const result = compile_for_viz({})
    expect(result).toEqual({ success: true, error_message: "" })
  })

  test("accepts data map and returns CompileResult shape", () => {
    const data = {
      code: { id: "c1", value: "1" },
      "::above": { id: "a1", value: null },
    }
    const result = compile_for_viz(data)
    expect(result).toHaveProperty("success")
    expect(result).toHaveProperty("error_message")
    expect(typeof (result as CompileResult).success).toBe("boolean")
    expect(typeof (result as CompileResult).error_message).toBe("string")
  })
})

describe("handle_compile_io", () => {
  test("decodes request, calls compile_for_viz, invokes callback with CompileResponse", (done) => {
    const env = empty_lexical_environment("test")
    const call = {
      request: {
        data: {
          code: {
            id: "card-1",
            value: new Uint8Array(JSON.stringify("(+ 1 2)").split("").map((c) => c.charCodeAt(0))),
          },
        },
      },
    } as unknown as ServerUnaryCall<CompileRequest, CompileResponse>
    const callback: sendUnaryData<CompileResponse> = (err, res) => {
      expect(err).toBeNull()
      expect(res).toBeDefined()
      expect(res!.success).toBe(true)
      expect(res!.errorMessage).toBeDefined()
      done()
    }
    handle_compile_io(call, callback, env)
  })
})
