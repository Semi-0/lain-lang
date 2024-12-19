import type { LayeredObject } from "sando-layer/Basic/LayeredObject";
import { as_type } from "./type_layer";
import { LispType } from "./type_layer";

export function scheme_list(arr: any[]): LayeredObject{
   return as_type(arr, LispType.list)
}

export function scheme_symbol(sym: string): LayeredObject{
   return as_type(sym, LispType.symbol)
}

export function scheme_string(str: string): LayeredObject{
   return as_type(str, LispType.string)
} 

export function scheme_number(num: number): LayeredObject{
   return as_type(num, LispType.number)
}

export function scheme_boolean(bool: boolean): LayeredObject{
   return as_type(bool, LispType.boolean)
} 

export function scheme_quoted(quoted: LayeredObject): LayeredObject{
   return as_type(quoted, LispType.quoted)
}

