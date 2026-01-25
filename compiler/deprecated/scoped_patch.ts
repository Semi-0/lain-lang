// import { match_args, register_predicate } from "generic-handler/Predicates"
// import { type Cell, construct_cell, construct_propagator, is_nothing, primitive_propagator, strongest_value } from "ppropogator"
// import { cell_strongest, update_cell } from "ppropogator/Cell/Cell"
// import { generic_wrapper } from "generic-handler/built_in_generics/generic_wrapper"
// import { is_map } from "ppropogator/Helper/Helper"
// import { to_string } from "generic-handler/built_in_generics/generic_conversation"
// import { define_generic_procedure_handler } from "generic-handler/GenericProcedure"
// import { is_number } from "generic-handler/built_in_generics/generic_predicates"
// import { get_base_value, the_nothing } from "@/cell/CellValue"
// import { cell_merge, merge_layered } from "@/cell/Merge"
// import { is_layered_object, type LayeredObject } from "sando-layer/Basic/LayeredObject"
// import { make_annotation_layer } from "sando-layer/Basic/Layer"
// import { default_merge_procedure } from "sando-layer/Basic/LayerGenerics"
// import * as chain from "../naming_chain"
// import { construct_layered_datum } from "sando-layer/Basic/LayeredDatum"
// import { compile_relative_naming_to_string } from "../naming_chain"
// import { compose } from "generic-handler/built_in_generics/generic_combinator"
// import { base_equal } from "ppropogator/Shared/base_equal"

// export const scoped_layer = make_annotation_layer("scope_source",
//     (
//         get_name: () => string,
//         has_value: (object: any) => boolean,
//         get_value: (object: any) => any,
//         summarize_self: () => string[]
//     ) => {

//         function get_default_value(): any {
//             return 0
//         }

//         function get_procedure(name: string, arity: number): any | undefined {
//             return default_merge_procedure(
//                 (a: any, b: any) => {
//                     // we just have this for now
//                     if (is_number(a) && is_number(b)) {
//                         if (a > b) {
//                             return b
//                         }
//                         else {
//                             return a
//                         }
//                     }
//                     else if (is_number(a)) {
//                         return a 
//                     }
//                     else if (is_number(b)) {
//                         return b
//                     }
               
//                     else {
//                         throw new Error("merge_scoped_patch: unknown naming type" + to_string(a) + " and " + to_string(b))
//                     }
//                 },
//                 []
//             ) 
//         }

//         return {
//             get_name,
//             has_value,
//             get_value,
//             get_default_value,
//             get_procedure,
//             summarize_self,
//         }
//     }
// )

// export const has_scoped_layer = (x: LayeredObject<any>) => {
//     return x.has_layer(scoped_layer)
// }


// export const get_scope = (x: LayeredObject<any>) => {
//     return x.get_layer_value(scoped_layer)
// }

// export const is_same_scope = (a: chain.relative_naming, b: chain.relative_naming) => {
//     return chain.naming_equal(a, b)
// }

// export const value_is_same_scope : (a: LayeredObject<any>, b: LayeredObject<any>) => boolean = generic_wrapper(
//     is_same_scope,
//     (x) => x,
//     get_scope,
//     get_scope
// )

// // scoped patch is just a value annotated with scoped layer
// type ScopedPatch =  LayeredObject<any>

// export const construct_scoped_patch = (value: any, scope: chain.relative_naming) => {
//     return construct_layered_datum(value, scoped_layer, scope)
// }

// // maybe a scope patch can be a special format of carried cell?
// // but then how can it know that the whole thing is updating

// export const is_scoped_patch = register_predicate("is_scoped_patch", (x: any) => {
//     return is_layered_object(x) && has_scoped_layer(x)
// })


// export const is_scoped_patch_dict = register_predicate("is_scoped_patch_dict", (x: Map<string, any>) => {
//     // its better to check every but thats too expensive 
//     return is_map(x) && x.get("is_scoped_patch") == true 
// })


// export const get_scope_in_string: (x: LayeredObject<any>) => string = compose(get_scope, compile_relative_naming_to_string)

// export const get_distance_from_scope_string: (x: string) => number = compose(chain.get_relative_naming_from_string, chain.relative_naming_get_distance)

// export const merge_scoped_patch = (a: ScopedPatch, b: ScopedPatch) => {
//     if (value_is_same_scope(a, b)) {
//         return construct_scoped_patch_dict(
//             cell_merge(
//                 get_base_value(a), 
//                 get_base_value(b)
//             ), 
//             get_scope(a)
//         )
//     }
//     else {
//         const dict = construct_scoped_patch_dict(get_base_value(a), get_scope(a))
//         dict.set(compile_relative_naming_to_string(get_scope(b)), get_base_value(b))
//         return dict
//     }
// }

// export const merge_scoped_patch_dict = (a: Map<string, any>, b: ScopedPatch) => {
//         const already_have  = a.get(get_scope_in_string(b))
//         // if allready have a it should merge with current cell_merge
//         // here is trickey if we goes cell_merge it would cause infinite loop but why?
//         if ((already_have != undefined) && (already_have != null)) {
           
//             // because in the cell merge it would merge anything to scope patch
//             // so it would cause infinite loop
//             a.set(get_scope_in_string(b), cell_merge(already_have, get_base_value(b)))
//             return a
//         }
//         else {
//             a.set(get_scope_in_string(b), cell_merge(the_nothing, get_base_value(b)))
//             return a
//         }
// }


// // because scoped patch is now a layered object
// // so generic merge cannot recognize it


// define_generic_procedure_handler(merge_layered, match_args(is_nothing, is_scoped_patch), (a: any, b: any) => b)

// define_generic_procedure_handler(merge_layered, match_args(is_scoped_patch, is_scoped_patch), merge_scoped_patch)

// define_generic_procedure_handler(merge_layered, match_args(is_scoped_patch_dict, is_scoped_patch), merge_scoped_patch_dict)

// export const new_scoped_patch_dict = () => {
//     return new Map<string, any>([
//         ["is_scoped_patch", true]
//     ])
// }

// export const construct_scoped_patch_dict = (value: any, distance: chain.relative_naming) => {
//     return new Map<string, any>([
//         ["is_scoped_patch", true],
//         [compile_relative_naming_to_string(distance), value]
//     ])
// }


// export const get_mininum_distance_key: (x: Map<string, any>) => string = (x: Map<string, any>) => {
//     return Array.from(x.keys()).reduce((a: string, b: string) => {
//         return a < b ? a : b
//     })
// }

// export const strongest_value_scoped_patch_dict = (x: Map<string, any>) => {
//     const maybe_closest = x.get("0")
//     if ((maybe_closest != undefined) && (maybe_closest != null) && (!is_nothing(maybe_closest))) {
//         return construct_scoped_patch(maybe_closest, 0)
//     }
//     else {
//         const entries = Array.from(x.entries()).filter(([key, value]) => {
//             return key !== "is_scoped_patch"
//         })

//         const smallest_distance_entry = entries.reduce((a: [string, any], b: [string, any]) => {
//             // contradiction is mirrored
//             const distance_a = Number(get_base_value(a[0]))
//             const distance_b = Number(get_base_value(b[0]))

//             const value_a = get_base_value(a[1])
//             const value_b = get_base_value(b[1])

//             if ((is_nothing(value_a)) && (is_nothing(value_b))) {
//                 return a
//             }
//             else if (is_nothing(value_a)) {
//                 return b
//             }
//             else if (is_nothing(value_b)) {
//                 return a
//             }
//             else {
//                 if (distance_a > distance_b) {
//                     return b
//                 }
//                 else {
//                     return a
//                 }
//             }
//             // all the number must be above 0 so it must be bigger than this
//         }, ["-1", the_nothing])

//         // smallest distance entry value
//         // maybe its better to abstract this
//         // annotate with scope
//         return construct_scoped_patch(
//             smallest_distance_entry[1], 
//             get_distance_from_scope_string(smallest_distance_entry[0])
//         )
//     }
// }


// // define_generic_procedure_handler(strongest_value, match_args(is_scoped_patch), (patch: ScopedPatch) => {
// //     return strongest_value(patch.value)
// // })

// // const is_layered_scoped_patch = register_predicate("is_layered_scoped_patch", (x: any) => {
// //     return is_layered_object(x) && is_scoped_patch(get_base_value(x))
// // })

// // define_generic_procedure_handler(strongest_value, match_args(is_layered_scoped_patch), (x: LayeredObject<any>) => {
// //     return strongest_value(get_base_value(x))
// // })


// define_generic_procedure_handler(strongest_value, match_args(is_scoped_patch_dict), strongest_value_scoped_patch_dict)


// export const is_layered_scoped_patch_dict = register_predicate("is_layered_scoped_patch_dict", (x: any) => {
//     return is_layered_object(x) && is_scoped_patch_dict(get_base_value(x))
// })


// define_generic_procedure_handler(strongest_value, match_args(is_layered_scoped_patch_dict), (x: LayeredObject<any>) => {
//     return strongest_value(get_base_value(x))
// })


// // a better way is to have contradiction handler..
// // if the value is as nested as env
// // we dont need distance
// // but the parential parent is unknown
// // a problem is if the value is a contradiction or nothing
// // it will be ignored and not reflected in caller
// // which is not good infrastructure design
// export const p_scoped_patch =  (value: Cell<any>, distance: number, output: Cell<any>) => construct_propagator([value], [output], () => {
//     // what if i just avoid the nothing in scoped patch?
//     const v = cell_strongest(value) as LayeredObject<any>
//     if (is_nothing(v)) {
//         // console.log("nothing")
//         return
//     }
//     else {

//         if (has_scoped_layer(v)) {
//             // this is the wrong way to do it,
//             // a beter way is prevent env storage have the latered object
//             console.error("already have layered patch")
//             // console.log(value.summarize())
//             // console.log(output.summarize())
//             const patch = construct_scoped_patch(
//                 flatten_layered_object_into_normal_value(v),
//                 distance
//             )
//             update_cell(output, patch)
//         }
//         else{
   
//             const patch = v.update_layer(
//                 scoped_layer,
//                 distance
//             )
            
//             update_cell(output, patch)
//         }
//     }
// }, "p_scoped_patch")

// export const ce_scoped_patch = (value: Cell<any>, distance: number) => {
//     const patched = construct_cell("scoped_patch")
//     p_scoped_patch(value, distance, patched)
//     return patched
// }

// // is it possible we can give each environment an identity
// // and maybe make a source layer
// // and in compiler 
// // it need to make sure that the env is correctly giving env based patch
// // and we need to constraint that psync doesn't sync other patch back to current env
// // so we don't fuck up locally made variables 


// export const flatten_layered_object_into_normal_value: (x: LayeredObject<any>) => any = (x: LayeredObject<any>) => {
//     const v = get_base_value(x)
//     if (is_layered_object(v)) {
//         return flatten_layered_object_into_normal_value(v)
//     }
//     else {
//         return v
//     }
// }

// export const p_sync_back_most_outside = (from: Cell<any>, to: Cell<any>) => construct_propagator([from], [to], () => {
//     const from_value = cell_strongest(from) as LayeredObject<any>
//     if (is_nothing(from_value)) {
//         return
//     }
//     else {
//         const scope = get_scope(from_value)

//         if (scope != undefined && scope != null && (chain.naming_equal(scope, 0))) {

//             // this has not check whether to already have value or not
//             if (is_nothing(cell_strongest(to))){
//                 update_cell(to, flatten_layered_object_into_normal_value(from_value)) 
//             }
//             else {
//                 const a = cell_strongest(to)
//                 if (base_equal(a, from_value)){
//                     return
//                 }
//                 else{
//                     update_cell(to, flatten_layered_object_into_normal_value(from_value)) 
//                 }
//             }

//         }
//         else {
//             // what if i do it from here?
//             // update_cell(to, 
//             //     from_value.update_layer(
//             //         scoped_layer,
//             //         0
//             //     )
//             // )
//             // console.log("sync back")
//             // console.log(to_string(from_value))
//            return
//         }
        
//     }
// }, "p_sync_back_most_outside")


// export const p_relative_scope_patch = (distance: number) => (value: Cell<any>, output: Cell<any>) => primitive_propagator(
//     (x: any) => {
//         return construct_scoped_patch(x, distance)
//     },
//     "p_relative_scope_patch"
// )(value, output)

// // absolute scope should not use the same layer 
// // otherwise it would confuse other

// // lets just filter it for now

// //TODO! remove scoped layer to outside!!!!
// // and make sure internal propagator passed a scoped patch!!!

// // we need a absolute layer if we want to resolve it to something like reason layer
// export const resolve_relative_scope = primitive_propagator(
//     (x: LayeredObject<any>) => {
//         return x.remove_layer(scoped_layer)
//     },
//     "resolve_relative_scope"
// )

