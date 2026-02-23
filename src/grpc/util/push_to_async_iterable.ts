/**
 * Generic push-to-async-iterable bridge.
 * Call push(value) to feed the iterable; call close() to end it.
 * Consumer can "yield* iterable" or for await (const x of iterable).
 */
export function create_push_to_async_iterable<T>(): {
  push: (value: T) => void
  close: () => void
  iterable: AsyncIterable<T>
} {
  const queue: T[] = []
  let closed = false
  let resolve_current_wait: (() => void) | null = null

  function notify_waiter(): void {
    if (resolve_current_wait !== null) {
      resolve_current_wait()
      resolve_current_wait = null
    }
  }

  function push(value: T): void {
    if (closed) return
    queue.push(value)
    notify_waiter()
  }

  function close(): void {
    closed = true
    notify_waiter()
  }

  async function wait_until_item_or_closed(): Promise<void> {
    if (queue.length > 0 || closed) return
    await new Promise<void>((r) => {
      resolve_current_wait = r
    })
  }

  const iterable: AsyncIterable<T> = {
    [Symbol.asyncIterator](): AsyncIterator<T> {
      return {
        async next(): Promise<IteratorResult<T>> {
          while (true) {
            const next = queue.shift()
            if (next !== undefined) {
              return { value: next, done: false }
            }
            if (closed) {
              return { value: undefined, done: true }
            }
            await wait_until_item_or_closed()
          }
        },
      }
    },
  }

  return { push, close, iterable }
}
