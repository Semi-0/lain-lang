import type { Cell, PrimitiveObject, Relation } from "../type";
import { universal_ancestor } from "./relation";
import  * as O from "fp-ts/Option";
import { pipe } from "fp-ts/lib/function";


type Global_Env = Map<string, any>;

export function empty_global_env(): Global_Env {
    const env = new Map<string, any>();
    env.set("parent", universal_ancestor());
    env.set("disposables", new Map<string, PrimitiveObject>());
    return env;
}   

export function get_global_parent(): O.Option<Relation>{
    return O.fromNullable(global_env.get("parent"));
} 

export function set_global_parent(parent: Relation): void{
    global_env.set("parent", parent);
} 

export function add_child(child: Relation): void{
    pipe(
        get_global_parent(),
        O.map(parent => {
            parent.add_child(child);
        }),
        O.getOrElse(() => {})
    )
}

export function add_primitive(id: string, primitive: PrimitiveObject): void{
    global_env.get("disposables").set(id, primitive);
}

export function get_primitive(id: string): O.Option<PrimitiveObject>{
    return O.fromNullable(global_env.get("disposables").get(id));
} 

export function remove_primitive(id: string): void{
    global_env.get("disposables").delete(id);
}

export var global_env: Global_Env = empty_global_env();


export function parameterize(
    action: () => void, 
    execute: () => void
): void{
    const original = new Map(global_env);
    action();
    execute();
    global_env = original;  
}