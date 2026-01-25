



// absolute naming goes like 
// compiler.apply_propagator.1

import { is_equal } from "generic-handler/built_in_generics/generic_arithmetic"
import { is_array } from "generic-handler/built_in_generics/generic_predicates"
import { generic_wrapper } from "generic-handler/built_in_generics/generic_wrapper"
import { register_predicate } from "generic-handler/Predicates"


type absolute_naming = string[] 

export const is_absolute_naming = register_predicate("is_absolute_naming", (naming: string[]): boolean => {
    return naming.length > 0 && naming[0] == "absolute"
})

export const compile_absolute_naming_to_string = (naming: absolute_naming): string => {
    return naming.join(".")
}

export const get_absolute_naming_from_string = (naming: string): absolute_naming => {
    return ["abs", ...naming.split(".")]
} 

export const make_absolute_naming = (naming: string[]): absolute_naming => {
    return ["abs", ...naming]
} 

export const make_absolute_naming_string = (naming: string[]): string => {
    return compile_absolute_naming_to_string(make_absolute_naming(naming))
}

export const is_absolute_naming_string = register_predicate("is_absolute_naming_string", (naming: string): boolean => {
    return naming.startsWith("abs.")
})

// relative naming goes backwards 
// child_closure -> parent 

export type relative_naming = number
export type relative_naming_array = number[]


export const is_relative_naming = register_predicate("is_relative_naming", (naming: number): boolean => {
    return naming >= 0
})

export const compile_relative_naming_to_string = (naming: relative_naming): string => {
    return naming.toString()
}

export const get_relative_naming_from_string = (naming: string): relative_naming => {
    return parseInt(naming)
}

export const make_relative_naming = (distance: number): relative_naming => {
    return distance
}

export const is_relative_naming_string = register_predicate("is_relative_naming_string", (naming: string): boolean => {
    return !isNaN(parseInt(naming))
})

export const relative_naming_get_distance = (chain: relative_naming): number => {
    return chain
}

export const is_relative_naming_array = register_predicate("is_relative_naming_array", (naming: any[]): boolean => {
    return is_array(naming)
})

export const construct_relative_naming_array = (namings: relative_naming[]): relative_naming_array => {
    return namings
}

export const relative_naming_array_join = (a: relative_naming_array, b: relative_naming): relative_naming_array => {
   const copy = a.slice()
   copy.push(b)
   return copy
}

export const combine_relative_naming_array = (a: relative_naming_array, b: relative_naming_array): relative_naming_array => {
    return a.concat(b)
}



export const naming_equal : (a: relative_naming, b: relative_naming) => boolean = generic_wrapper(
    is_equal,
    (x) => x,
    compile_relative_naming_to_string,
    compile_relative_naming_to_string
)

