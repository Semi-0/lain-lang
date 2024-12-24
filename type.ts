import type { isQuestionOrPlusOrMinusToken } from "typescript"

export const the_nothing = "$the_nothing"

export const the_contradiction = "$the_contradiction"

export const dispose = "$dispose"

export type Nothing = typeof the_nothing;

export type Contradiction = typeof the_contradiction;

export type Dispose = typeof dispose;

export type CellValue<E> = E | Nothing | Contradiction | Dispose;

export interface Cell<E>{
    id: string,
    value: CellValue<E>,
    neighbors: Propagator[],

}

export interface Subnet<E>{
    update: (update: E) => void,
    get: () => E,
}


export interface Propagator{
    id: string,
    activate: () => void,
    inputs: Cell<any>[],
    outputs: Cell<any>[],
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


