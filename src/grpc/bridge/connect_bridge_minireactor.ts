import { pipe } from "effect"
import { filter, map, subscribe, tap } from "../../../MiniReactor/MrCombinators"
import { dispose } from "../../../MiniReactor/MrPrimitiveCombinators"
import { construct_state } from "../../../MiniReactor/MrState"
import type { RuntimeCardOutputEvent } from "./card_runtime_events.js"
import type { SessionState } from "../session/session_store.js"
import { session_push } from "../session/session_store.js"
import { to_card_update_message } from "../codec/session_encode.js"
import { get_base_value } from "sando-layer/Basic/Layer.js"
import { compose } from "generic-handler/built_in_generics/generic_combinator.js"

type RuntimeBridgeStage = {
  event: RuntimeCardOutputEvent
  key: string
  signature: string
}

export type RuntimeBridgeTrace = (
  action: "runtime_output_skipped_equal_state" | "runtime_output_skipped_equal_outbox" | "runtime_output_forwarded",
  data: RuntimeCardOutputEvent
) => void

export type RuntimeBridge = {
  receive_io: (event: RuntimeCardOutputEvent) => void
  dispose_io: () => void
}

function value_signature(value: unknown): string {
  if (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return `${typeof value}:${String(value)}`
  }
  try {
    return `json:${JSON.stringify(value)}`
  } catch {
    return `string:${String(value)}`
  }
}


const base_value_signature = compose(get_base_value, value_signature)


function stage_from_event(event: RuntimeCardOutputEvent): RuntimeBridgeStage {
  return {
    event,
    key: `${event.cardId}${event.slot}`,
    // @ts-ignore
    signature: base_value_signature(event.value),
  }
}

function not_equal_to_session_state(
  state: SessionState,
  trace_io: RuntimeBridgeTrace
): (stage: RuntimeBridgeStage) => boolean {
  return (stage: RuntimeBridgeStage) => {
    const stateValue = state.slotMap[stage.key]?.value
    // @ts-ignore
    const signatured_value = base_value_signature(stateValue)
    if (stateValue !== undefined && 
        signatured_value === stage.signature) {
      trace_io("runtime_output_skipped_equal_state", stage.event)
      return false
    }
    else {
      return true
    }
  }
}

function not_equal_to_outbox(
  outbox: Map<string, string>,
  trace_io: RuntimeBridgeTrace
): (stage: RuntimeBridgeStage) => boolean {
  return (stage: RuntimeBridgeStage) => {
    const previous = outbox.get(stage.key)
    if (previous === stage.signature) {
      trace_io("runtime_output_skipped_equal_outbox", stage.event)
      return false
    }
    return true
  }
}

function forward_to_session_io(
  state: SessionState,
  outbox: Map<string, string>,
  trace_io: RuntimeBridgeTrace
): (stage: RuntimeBridgeStage) => void {
  return (stage: RuntimeBridgeStage) => {
    outbox.set(stage.key, stage.signature)
    trace_io("runtime_output_forwarded", stage.event)
    session_push(
      state,
      to_card_update_message(stage.key, {
        id: stage.event.cardId,
        value: stage.event.value,
      })
    )
  }
}

export function create_runtime_output_bridge_io(
  state: SessionState,
  trace_io: RuntimeBridgeTrace
): RuntimeBridge {
  const outbox = new Map<string, string>()
  let disposed = false
  const source = construct_state<RuntimeCardOutputEvent | undefined>(undefined)
  const sink = pipe(
    source.node,
    filter((event) => event !== undefined),
    map((event) => stage_from_event(event as RuntimeCardOutputEvent)),
    filter(not_equal_to_session_state(state, trace_io)),
    filter(not_equal_to_outbox(outbox, trace_io)),
    tap(forward_to_session_io(state, outbox, trace_io)),
    subscribe(() => {})
  )
  return {
    receive_io: (event: RuntimeCardOutputEvent) => {
      if (disposed) {
        return
      }
      source.receive(event)
    },
    dispose_io: () => {
      disposed = true
      dispose(sink)
    },
  }
}
