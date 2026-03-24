import { beforeEach, describe, expect, test } from "bun:test"
import { init_system } from "../compiler/incremental_compiler"
import { empty_lexical_environment } from "../compiler/env/env"
import { apply_card_api_events_io, diff_slot_maps_to_card_api_events } from "../src/grpc/delta/card_slot_sync"
import { get_card_metadata } from "../src/grpc/card/card_api"

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
    const adds = events.filter((event) => event.type === "card_add")
    expect(connects.length).toBe(1)
    expect(adds.map((e) => e.card_id).sort()).toEqual(["card-a", "card-b"])
  })

  test("apply connect: card_add for both keyed cards then single connect", () => {
    const env = empty_lexical_environment("card-slot-sync")
    const events = diff_slot_maps_to_card_api_events(
      {},
      {
        "card-auto-a::right": { id: "card-auto-b", value: undefined },
        "card-auto-b::left": { id: "card-auto-a", value: undefined },
      }
    )
    const report = apply_card_api_events_io(env, events)
    expect(report.issues.length).toBe(0)
    expect(get_card_metadata("card-auto-a")).toBeDefined()
    expect(get_card_metadata("card-auto-b")).toBeDefined()
  })

  test("code-only delta emits card_add then card_update (metadata-backed)", () => {
    const env = empty_lexical_environment("card-slot-sync")
    const events = diff_slot_maps_to_card_api_events(
      {},
      {
        "card-code-onlycode": { id: "card-code-only", value: "(+ 1 2 out)" },
      }
    )
    expect(events.map((e) => e.type)).toEqual(["card_add", "card_update"])
    const report = apply_card_api_events_io(env, events)
    expect(report.issues).toEqual([])
    expect(get_card_metadata("card-code-only")).toBeDefined()
  })

  test("diff does not emit ::this updates while sync_this_slots is disabled in diff", () => {
    const events = diff_slot_maps_to_card_api_events(
      {
        "card-this::this": { id: "card-this", value: 1 },
      },
      {
        "card-this::this": { id: "card-this", value: 2 },
      }
    )
    expect(events).toEqual([])
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

  test("apply card_update without prior card_add throws (metadata missing)", () => {
    const env = empty_lexical_environment("card-slot-sync")
    expect(() =>
      apply_card_api_events_io(env, [
        {
          type: "card_update",
          card_id: "card-missing-update",
          value: 123,
        },
      ])
    ).toThrow(/Card metadata not found/)
  })

  test("apply card_add then card_update on new card succeeds", () => {
    const env = empty_lexical_environment("card-slot-sync")
    const report = apply_card_api_events_io(env, [
      { type: "card_add", card_id: "card-new-seq" },
      { type: "card_update", card_id: "card-new-seq", value: 123 },
    ])
    expect(report.issues).toEqual([])
    expect(get_card_metadata("card-new-seq")).toBeDefined()
  })
})
