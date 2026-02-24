import { beforeEach, describe, expect, test } from "bun:test"
import { init_system } from "../compiler/incremental_compiler"
import { empty_lexical_environment } from "../compiler/env/env"
import { apply_card_api_events_io, diff_slot_maps_to_card_api_events } from "../src/grpc/delta/card_slot_sync"
import { runtime_get_card } from "../src/grpc/card/card_api"

describe("card_slot_sync", () => {
  beforeEach(() => {
    init_system()
  })

  test("diff dedupes reciprocal neighbor declarations", () => {
    const events = diff_slot_maps_to_card_api_events(
      {},
      {
        "card-a::right": { id: "card-b", value: undefined },
        "card-b::left": { id: "card-a", value: undefined },
      }
    )
    const connects = events.filter((event) => event.type === "card_connect")
    expect(connects.length).toBe(1)
  })

  test("apply connect ensures cards exist then connects", () => {
    const env = empty_lexical_environment("card-slot-sync")
    const events = diff_slot_maps_to_card_api_events(
      {},
      {
        "card-auto-a::right": { id: "card-auto-b", value: undefined },
      }
    )
    const report = apply_card_api_events_io(env, events)
    expect(report.issues.length).toBe(0)
    expect(runtime_get_card("card-auto-a")).toBeDefined()
    expect(runtime_get_card("card-auto-b")).toBeDefined()
  })

  test("code-only delta does not emit card update events", () => {
    const env = empty_lexical_environment("card-slot-sync")
    const events = diff_slot_maps_to_card_api_events(
      {},
      {
        "card-code-onlycode": { id: "card-code-only", value: "(+ 1 2 out)" },
      }
    )
    const report = apply_card_api_events_io(env, events)
    expect(events.length).toBe(0)
    expect(report.issues).toEqual([])
    expect(runtime_get_card("card-code-only")).toBeUndefined()
  })

  test("diff emits card_update when ::this value changes", () => {
    const events = diff_slot_maps_to_card_api_events(
      {
        "card-this::this": { id: "card-this", value: 1 },
      },
      {
        "card-this::this": { id: "card-this", value: 2 },
      }
    )
    expect(events).toEqual([
      {
        type: "card_update",
        card_id: "card-this",
        value: 2,
      },
    ])
  })

  test("diff skips card_update when ::this value is unchanged", () => {
    const shared = { nested: { a: 1 } }
    const events = diff_slot_maps_to_card_api_events(
      {
        "card-this::this": { id: "card-this", value: shared },
      },
      {
        "card-this::this": { id: "card-this", value: { nested: { a: 1 } } },
      }
    )
    const updates = events.filter((event) => event.type === "card_update")
    expect(updates.length).toBe(0)
  })

  test("apply card_update on missing card adds card then updates (no issue)", () => {
    const env = empty_lexical_environment("card-slot-sync")
    const report = apply_card_api_events_io(env, [
      {
        type: "card_update",
        card_id: "card-missing-update",
        value: 123,
      },
    ])
    expect(report.issues).toEqual([])
    expect(runtime_get_card("card-missing-update")).toBeDefined()
  })
})
