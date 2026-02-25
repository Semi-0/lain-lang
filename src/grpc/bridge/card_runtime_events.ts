export type RuntimeCardOutputEvent = {
  cardId: string
  slot: "::this"
  value: unknown
}

let sessions_push: ((event: RuntimeCardOutputEvent) => void) | null = null

export function init_runtime_card_output_io(
  fn: (event: RuntimeCardOutputEvent) => void
): void {
  sessions_push = fn
}

export function emit_runtime_card_output_io(event: RuntimeCardOutputEvent): void {
  sessions_push?.(event)
}
