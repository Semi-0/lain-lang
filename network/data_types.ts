
import { register_predicate } from "generic-handler/Predicates";
import { the_contradiction, the_nothing, type Cell } from "../type";

import type { CellValue } from "../type";
import { is_nothing } from "../shared/predicates";

// export function construct_pointer<T>(cell: Cell<T>): Pointer<T>{
//     return {
//        get_value: () => {
//         return cell.value
//        },
//     }
// }


// export interface Pointer<T>{
//     get_value: () => CellValue<T>,
// }

export interface Pair<T>{
    fst: T
    snd: T
}

export function cons<T>(fst: CellValue<T>, snd: CellValue<T>): Pair<CellValue<T>>{
    console.log("cons", fst, snd)
    return {
        fst: fst,
        snd: snd
    }
}

export function cons_cell<T>(fst: Cell<T>, snd: Cell<T>): Pair<CellValue<T>>{
    return cons(fst.value, snd.value);
}

export const is_pair = register_predicate("is_pair", (x: any) => {
    return x!= undefined && x.fst != undefined && x.snd != undefined
})

export function car<T>(pair: CellValue<Pair<T>>): CellValue<Pair<T>>{
    if (is_pair(pair)) {
        // @ts-ignore
        // return pair.fst.get_value();
        return pair.fst
    }
    else {
        return the_nothing
    }
}

export function cdr<T>(pair: CellValue<Pair<T>>): CellValue<Pair<T>>{
    if (is_pair(pair)) {
        // @ts-ignore
        // return pair.snd.get_value();
        return pair.snd
    }
    else {
        return the_nothing
    }
}

export function array_to_pair<T>(array: CellValue<CellValue<T>[]>): CellValue<Pair<CellValue<T>>>{
   var pair: CellValue<Pair<CellValue<T>>> = the_nothing;
   for (let i = array.length - 1; i >= 0; i--) {
    // @ts-ignore
     pair = cons(array[i], pair);
   }
   return pair;
}

export function map<T, U>(pair: CellValue<Pair<T>>, f: (x: T) => CellValue<U>): CellValue<Pair<U>>{
    if (is_nothing(pair)) {
        return the_nothing;
    }
    else {
        // @ts-ignore
        return cons(f(car(pair)), map(cdr(pair), f));
    }
}
    

export function filter<T>(pair: CellValue<Pair<T>>, f: (x: T) => boolean): CellValue<Pair<T>>{
    if (is_nothing(pair)) {
        return the_nothing;
    }
    // @ts-ignore
    else if (f(car(pair))) {
        // @ts-ignore
        return cons(car(pair), filter(cdr(pair), f));
    }
    else {
        return filter(cdr(pair), f);
    }
}

export function fold<T, U>(pair: CellValue<Pair<T>>, f: (x: T, y: U) => U, initial: U): U{
    var acc: U = initial;
    if (is_nothing(pair)) {
        return acc;
    }
    else {
        // @ts-ignore
        acc = f(acc, car(pair));
        return fold(cdr(pair), f, acc);
    }
}