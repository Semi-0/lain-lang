
import { register_predicate } from "generic-handler/Predicates";
import { the_nothing, type Cell } from "../type";

import type { CellValue } from "../type";

export function construct_pointer<T>(cell: Cell<T>): Pointer<T>{
    return {
        cell: cell,
    }
}


export interface Pointer<T>{
    cell: Cell<T>,
}

export interface Pair<T>{
    fst: Pointer<T>,
    snd: Pointer<T>,
}

export function construct_pair<T>(fst: Cell<T>, snd: Cell<T>): Pair<T>{
    return {
        fst: construct_pointer(fst),
        snd: construct_pointer(snd),
    }
}

export const is_pair = register_predicate("is_pair", (x: any) => {
    return x!= undefined && x.fst != undefined && x.snd != undefined
})

export function get_fst<T>(pair: Pair<T> | typeof the_nothing): CellValue<T>{
    if (is_pair(pair)) {
        // @ts-ignore
        return pair.fst.cell.value;
    }
    else {

        return the_nothing
    }
}

export function get_snd<T>(pair: Pair<T> | typeof the_nothing): CellValue<T>{
    if (is_pair(pair)) {
        // @ts-ignore
        return pair.snd.cell.value;
    }
    else {
        return the_nothing;
    }
}