import { describe, test, expect } from "bun:test"
import { Worker } from "node:worker_threads"

type CompileResp =
  | { id: string; ok: true; result_summary: string }
  | { id: string; ok: false; error: string; stack?: string }

const normalizeSummary = (s: string): string =>
  s
    // Cells include nondeterministic IDs; normalize them.
    .replace(/ID:\s+[0-9a-f-]+/gi, "ID: <id>")

const runInWorker = async (code: string): Promise<CompileResp> => {
  const workerUrl = new URL("./compiler_worker.ts", import.meta.url)
  const worker = new Worker(workerUrl, { type: "module" })

  const id = crypto.randomUUID()

  const respP = new Promise<CompileResp>((resolve, reject) => {
    worker.on("message", (msg: CompileResp) => resolve(msg))
    worker.on("error", reject)
    worker.on("exit", (code) => {
      if (code !== 0) reject(new Error(`worker exited with code ${code}`))
    })
  })

  worker.postMessage({ id, code })
  const resp = await respP
  worker.terminate()
  return resp
}

describe("worker_threads compiler isolation", () => {
  test("same program compiled in two workers yields same summary", async () => {
    // NOTE: incremental_compiler's `(? ...)` expects the inner expression to compile to a Cell
    // (so it can call `.summarize()`). A bare application like `(+ 1 2)` compiles to a propagator
    // (side-effecting network) and returns undefined, so keep this test to a constant.
    const program = "(? 1)"
    const [a, b] = await Promise.all([runInWorker(program), runInWorker(program)])

    if (!a.ok) throw new Error(`worker a failed: ${a.error}\n${a.stack ?? ""}`)
    if (!b.ok) throw new Error(`worker b failed: ${b.error}\n${b.stack ?? ""}`)
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
    if (a.ok && b.ok) {
      expect(normalizeSummary(a.result_summary)).toBe(normalizeSummary(b.result_summary))
    }
  })

  test("workers can compile different programs concurrently", async () => {
    const [a, b] = await Promise.all([
      runInWorker("(? 42)"),
      runInWorker("(? 7)"),
    ])

    if (!a.ok) throw new Error(`worker a failed: ${a.error}\n${a.stack ?? ""}`)
    if (!b.ok) throw new Error(`worker b failed: ${b.error}\n${b.stack ?? ""}`)
    expect(a.ok).toBe(true)
    expect(b.ok).toBe(true)
    if (a.ok && b.ok) {
      expect(typeof a.result_summary).toBe("string")
      expect(typeof b.result_summary).toBe("string")
      expect(a.result_summary).not.toBe("")
      expect(b.result_summary).not.toBe("")
    }
  })
})

