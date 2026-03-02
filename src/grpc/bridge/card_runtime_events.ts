export type RuntimeCardOutputEvent = {
  cardId: string
  slot: "::this"
  value: unknown
}

let sessions_push: ((event: RuntimeCardOutputEvent) => void) | null = null
const subscribers: Set<(event: RuntimeCardOutputEvent) => void> = new Set()

export function init_runtime_card_output_io(
  fn: (event: RuntimeCardOutputEvent) => void
): void {
  sessions_push = fn
}

export function subscribe_runtime_card_output(
  fn: (event: RuntimeCardOutputEvent) => void
): () => void {
  subscribers.add(fn)
  return () => {
    subscribers.delete(fn)
  }
}

export function emit_runtime_card_output_io(event: RuntimeCardOutputEvent): void {
  sessions_push?.(event)
  subscribers.forEach((fn) => fn(event))
}
