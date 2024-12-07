import type { isQuestionOrPlusOrMinusToken } from "typescript"

export const the_nothing = "$the_nothing"

export const the_contradiction = "$the_contradiction"

export type Nothing = typeof the_nothing;

export type Contradiction = typeof the_contradiction;

export type CellValue<E> = E | Nothing | Contradiction;

export interface Cell<E>{
    id: string,
    name: string,
    children: Cell<E>[],
    value: CellValue<E>,
    neighbors: Propagator[],
    disposer: () => void
}

export interface Propagator{
    id: string,
    name: string,
    children: Propagator[],
    neighbors: Cell<any>[],
    activate: () => void,
    cells: Cell<any>[],
    disposer: () => void
}

export interface PropagatorConstructor{
    (...cells: Cell<any>[]): Propagator
}

export interface Scheduler{
    propagators_to_alert: Propagator[],
    alerted_propagators: Propagator[],
    alert_propagator: (propagator: Propagator) => void, 
    execute: () => void,
    step_execute: () => void
    summarize: () => string
}