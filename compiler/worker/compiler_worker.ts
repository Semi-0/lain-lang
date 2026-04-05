import { parentPort } from "node:worker_threads"
import { set_global_state, PublicStateCommand, set_merge } from "ppropogator"
import { execute_all_tasks_sequential } from "ppropogator/Shared/Scheduler/Scheduler"
import { merge_temporary_value_set } from "ppropogator/DataTypes/TemporaryValueSet"
import { source_constant_cell } from "ppropogator/DataTypes/PremisesSource"

import { init_system } from "../incremental_compiler"
import { primitive_env } from "../primitive/stdlib"
import { run } from "../compiler_entry"

type CompileReq = {
  id: string
  code: string
  timestamp?: number
}

type CompileResp =
  | { id: string; ok: true; result_summary: string }
  | { id: string; ok: false; error: string; stack?: string }

let _initialized = false
const ensureInit = () => {
  if (_initialized) return
  // Each worker has its own global ppropogator state; still initialize deterministically.
  set_global_state(PublicStateCommand.CLEAN_UP)
  set_merge(merge_temporary_value_set)
  init_system()
  _initialized = true
}

const summarize = (x: any): string => {
  if (x && typeof x === "object" && typeof (x as any).summarize === "function") {
    return (x as any).summarize()
  }
  try {
    return JSON.stringify(x)
  } catch {
    return String(x)
  }
}

if (!parentPort) {
  throw new Error("compiler_worker must be run as a worker thread")
}

parentPort.on("message", async (req: CompileReq) => {
  try {
    ensureInit()
    const env = primitive_env("worker-env")
    const source = source_constant_cell("worker-source")
    const ts = req.timestamp ?? 0

    const result = run(req.code, env, source, ts)
    await execute_all_tasks_sequential(() => {})

    const resp: CompileResp = {
      id: req.id,
      ok: true,
      result_summary: summarize(result),
    }
    parentPort!.postMessage(resp)
  } catch (e) {
    const err = e as Error
    const resp: CompileResp = {
      id: req.id,
      ok: false,
      error: err?.message ?? String(e),
      stack: err?.stack,
    }
    parentPort!.postMessage(resp)
  }
})

