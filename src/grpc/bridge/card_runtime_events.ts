export type RuntimeCardOutputEvent = {
  cardId: string
  slot: "::this"
  value: unknown
}

const subscribers: Set<(event: RuntimeCardOutputEvent) => void> = new Set()

export function subscribe_runtime_card_output(
  fn: (event: RuntimeCardOutputEvent) => void
): () => void {
  subscribers.add(fn)
  return () => {
    subscribers.delete(fn)
  }
}

export function emit_runtime_card_output_io(event: RuntimeCardOutputEvent): void {
  subscribers.forEach((fn) => fn(event))
}
