
import { register_predicate } from "generic-handler/Predicates";
import { the_contradiction, the_nothing, type Cell } from "../type";

import type { CellValue } from "../type";

export function construct_pointer<T>(cell: Cell<T>): Pointer<T>{
    return {
       get_value: () => {
        return cell.value
       },
    }
}


export interface Pointer<T>{
    get_value: () => CellValue<T>,
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

export function get_fst<T>(pair: Pair<Pointer<T>> | typeof the_nothing): CellValue<T>{
    if (is_pair(pair)) {
        // @ts-ignore
        return pair.fst.get_value();
    }
    else {
        return the_nothing
    }
}

export function get_snd<T>(pair: Pair<T> | typeof the_nothing): CellValue<T>{
    if (is_pair(pair)) {
        // @ts-ignore
        return pair.snd.get_value();
    }
    else {
        return the_nothing
    }
}