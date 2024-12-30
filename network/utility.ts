import type { Cell, Propagator, PropagatorFunction } from "../type";



export function apply_propagator(cells: Cell<any>[], construct_propagator: PropagatorFunction): Propagator{

    // manually gc for higher order propagator

    const p = construct_propagator(...cells);

    return p;
}