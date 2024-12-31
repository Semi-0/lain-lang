import type { isQuestionOrPlusOrMinusToken } from "typescript"

import * as O from "fp-ts/Option";
import { register_predicate } from "generic-handler/Predicates";
import type { Eq } from "fp-ts/lib/Eq";

export const the_nothing = "$the_nothing"

export const the_contradiction = "$the_contradiction"

export const dispose = "$dispose"

export type Nothing = typeof the_nothing;

export type Contradiction = typeof the_contradiction;

export type Dispose = typeof dispose;

export type CellValue<E> = E | Nothing | Contradiction | Dispose;


export interface Relation extends Eq<Relation> {
    get_id: () => string,
    set_id: (id: string) => void,
    get_children: () => Set<Relation>,
    add_child: (child: Relation) => void,
    remove_child: (child: Relation) => void, 
    get_parent: () => O.Option<Relation>,
}

export const is_relation = register_predicate("is_relation", (primitive: PrimitiveObject) => {
    return primitive !== undefined &&
    "get_id" in primitive &&
    "set_id" in primitive &&
    "get_children" in primitive &&
    "add_child" in primitive &&
    "remove_child" in primitive &&
    "get_parent" in primitive;
})

export interface Cell<E> extends Eq<Cell<E>>{
    relation: Relation,
    value: CellValue<E>,
    add_neighbor: (propagator: Propagator) => void,
    remove_neighbor: (propagator: Propagator) => void,
    get_neighbors: () => Set<Propagator>,
}

export const is_cell = register_predicate("is_cell", (primitive: PrimitiveObject) => {
    return primitive !== undefined &&
    "relation" in primitive &&
    "value" in primitive &&
    "add_neighbor" in primitive &&
    "remove_neighbor" in primitive &&
    "get_neighbors" in primitive;
})


export interface Propagator extends Eq<Propagator>{
    relation: Relation,
    activate: () => void,
    inputs: Set<Cell<any>>,
    outputs: Set<Cell<any>>,
}

export const is_propagator = register_predicate("is_propagator", (primitive: PrimitiveObject) => {
    return primitive !== undefined &&
    "relation" in primitive &&
    "activate" in primitive &&
    "inputs" in primitive &&
    "outputs" in primitive;
})


export type PrimitiveObject = Cell<any> | Propagator;

export interface PropagatorFunction{
    (...cells: Cell<any>[]): Propagator
}

export interface Scheduler{
    propagators_to_alert: Set<Propagator>,
    alerted_propagators: Set<Propagator>,
    alert_propagator: (propagator: Propagator) => void, 
    execute: () => void,
    step_execute: () => void
    summarize: () => string
    clear: () => void
}


