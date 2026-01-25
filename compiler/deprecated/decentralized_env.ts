// import { register_predicate } from "generic-handler/Predicates"

// import { expr_value, type LainElement } from "../lain_element"
// import { type Cell, compound_propagator, construct_cell, Propagator } from "ppropogator"
// import { bi_sync, ce_constant, ce_identity, p_sync } from "ppropogator/Propagator/BuiltInProps"
// import { cell_strongest_base_value } from "ppropogator/Cell/Cell"
// import { generic_wrapper } from "generic-handler/built_in_generics/generic_wrapper"
// import { c_dict_accessor, ce_dict, ce_dict_accessor, ce_struct, p_construct_dict_carrier, p_struct } from "ppropogator/DataTypes/CarriedCell"
// import { is_map } from "ppropogator/Helper/Helper"
// import { v4 as uuidv4 } from 'uuid';
// // import {
// //     p_scoped_patch,
// //     p_sync_back_most_outside
// // } from "./scoped_patch"

// import { p_pioritize_leftmost } from "../selector"
// import { ce_snapshot } from "../dynamic_propagator"
// import { gun_cell_instance, gun_cell_receiver } from "../DB/serialize/gun_cell"
// import { IGunInstance } from "gun"
// import { to_string } from "generic-handler/built_in_generics/generic_conversation"
// import { source_cell } from "ppropogator/DataTypes/PremisesSource"
// import { p_construct_env, p_lexical_lookup } from "./env"


// // lets use linked list for 1st iteration first
// // there are faster way to do that
// // but it requires more complex implementation

// // think about DAG
// // that would be fun but lets deal with that later..

// export const gun_constant =  (db: IGunInstance, value: any) => {
//     const id = uuidv4()
//     const gun_cell = gun_cell_instance(
//         db,
//         "constant | " + to_string(value),
//         id
//     )

//     const $source = source_cell(
//         "constant | " + to_string(value),
//         value
//     )


//     // i know this would be expensive but keep this in prototype stage
//     bi_sync(gun_cell, $source)

//     return gun_cell
// }

// export const construct_closure = (db: IGunInstance, env: LexicalEnvironment, name: string, inputs: string[], outputs: string[], body: string[]) => {
//     return gun_constant(db, {
//         env: env,
//         name: name,
//         inputs: inputs,
//         outputs: outputs,
//         body: body
//     })
// }



// // now lexical environment itself is just a cell carrier
// export type LexicalEnvironment = Cell<Map<string, Cell<any>>>



// // maybe give env an identity
// export const is_lexical_environment = register_predicate("is_lexical_environment", (x: any) => {
//     return x !== undefined && x !== null && typeof x === "object" && "parent" in x && "variables" in x
// })


// export const parent_key =  "parent"
// export const id_key =  "id"

// // fuck i think maybe i need to use monad for gun db
// // but lets just keep it for now, it might overcomplicate the code

// // identity need to be unique
// export const construct_master_env = (parent: Cell<LexicalEnvironment>, id: string = "root", db: IGunInstance) => {
//      const env = gun_cell_instance(
//         db,
//         "env | " + id,
//         id
//      )

//      p_construct_env(parent, id, env as unknown as Cell<LexicalEnvironment>)
//      return env 
// }

// // assume there is already a master env in the network
// // we need to think about how we can just keep it as peer
// // one way is we might need to write combinator for envs
// export const construct_receiver_env = (parent: Cell<LexicalEnvironment>, id: string = "root", db: IGunInstance) => {
//     const env = gun_cell_receiver(
//        db,
//        "env | " + id,
//        id
//     )

//     p_construct_env(parent, id, env as unknown as Cell<LexicalEnvironment>)
//     return env 
// }



// export const empty_lexical_environment = (id: string, db: IGunInstance) => construct_master_env(construct_cell("root"), id, db)


// export const construct_master_env_with_inital_value = (initial: [string, Cell<any>][], id: string, db: IGunInstance) => {
//     const env = construct_master_env(construct_cell("root"), id, db)

//     p_construct_dict_carrier(
//         new Map<string, Cell<any>>(initial),
//         env as unknown as Cell<Map<string, any>>
//     )

//     return env 
// }

// // this needs abstraction 
// // self reflectivity?

// export const extend_master_env = (env: Cell<LexicalEnvironment>, new_env: Cell<LexicalEnvironment>, id: string, db: IGunInstance) => compound_propagator(
//     [env],
//     [new_env],
//     () => {
//        construct_master_env(env, id, db)
//     },
//     "extend_env"
// )


// export const ce_lexical_lookup = (key: string, env: LexicalEnvironment, db: IGunInstance, id: string) =>  {
//     // p_lexical_lookup can be cached
//     const assesor = gun_cell_instance(db, key + " | " + "accessor", id)
//     p_lexical_lookup(key, env, assesor)
//     return assesor
// }

// export const lexical_lookup_from_expr = generic_wrapper(
//     p_lexical_lookup,
//     (x) => x,
//     expr_value,
//     (x) => x,
//     (x) => x
// )

// // lexical lookup introduce and look up the value simutaniously 

// export const lookup = lexical_lookup_from_expr



// export const introduce = (key: LainElement, env: LexicalEnvironment, output: Cell<any>) => {
//     return lookup(key, env, output)
// }

// export const extend = construct_master_env

