import { pipe } from "effect"
import { subscribe } from "../../../MiniReactor/MrCombinators"
import { construct_state } from "../../../MiniReactor/MrState"
import { dispose } from "../../../MiniReactor/MrPrimitiveCombinators"

export type RuntimeCardOutputEvent = {
  cardId: string
  slot: "::this"
  value: unknown
}

type RuntimeCardOutputCallback = (event: RuntimeCardOutputEvent) => void

const runtime_output_source = construct_state<RuntimeCardOutputEvent | undefined>(undefined)

export function subscribe_runtime_card_output(
  callback: RuntimeCardOutputCallback
): () => void {
  const sink = pipe(
    runtime_output_source.node,
    subscribe((event) => {
      if (event !== undefined) {
        callback(event)
      }
    })
  )
  return () => {
    dispose(sink)
  }
}

export function emit_runtime_card_output_io(
  event: RuntimeCardOutputEvent
): void {
  runtime_output_source.receive(event)
}
