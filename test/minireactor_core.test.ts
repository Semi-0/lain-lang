import { describe, expect, test } from "bun:test"
import { map, reduce, subscribe } from "../MiniReactor/MrCombinators"
import { next } from "../MiniReactor/Notify"
import { construct_node } from "../MiniReactor/MrPrimitive"
import { apply, dispose } from "../MiniReactor/MrPrimitiveCombinators"

describe("MiniReactor core", () => {
  test("forward activation runs once per update", () => {
    const source = construct_node<number>()
    const seen: number[] = []
    const sink = subscribe((value: number) => {
      seen.push(value)
    })(map((value: number) => value * 2)(source))
    next(source, 3)
    expect(seen).toEqual([6])
    dispose(sink)
  })

  test("reduce accumulates and emits updated accumulator", () => {
    const source = construct_node<number>()
    const seen: number[] = []
    const reduced = reduce((acc: number, value: number) => acc + value, 0)(source)
    const sink = subscribe((value: number) => {
      seen.push(value)
    })(reduced)
    next(source, 1)
    next(source, 2)
    next(source, 3)
    expect(seen).toEqual([1, 3, 6])
    dispose(sink)
  })

  test("dispose detaches downstream graph", () => {
    const source = construct_node<number>()
    const seen: number[] = []
    const child = apply((notify: (value: number) => void, value: number) => {
      notify(value + 1)
    })(source)
    const sink = subscribe((value: number) => {
      seen.push(value)
    })(child)
    next(source, 1)
    dispose(child)
    next(source, 2)
    expect(seen).toEqual([2])
    dispose(sink)
  })
})
