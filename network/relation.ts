import type { Relation } from "../type";
import { v4 as uuidv4 } from 'uuid';
import * as O from "fp-ts/Option";
import { pipe } from "fp-ts/lib/function";
import { map } from "fp-ts/Set";
import { getEq } from "fp-ts/Set";

export function construct_relation(id: string, parent: O.Option<Relation> ): Relation{
    var children: Set<Relation> = new Set();

    const relation: Relation = {
        get_id: () => {
            return id;
        },
        set_id: (id: string) => {
            id = id;
        },
        get_children: () => {
            return children;
        },
        add_child: (child: Relation) => {
            children.add(child);
        },
        remove_child: (child: Relation) => {
            children.delete(child);
        },
        get_parent: () => {
            return parent;
        },
        equals: (x: Relation, y: Relation) => {
            return x.get_id() === y.get_id();
        }
    }

    return relation;

}

export function universal_ancestor(): Relation{
    const id = uuidv4();
    return {
        get_id: () => {
            return id;
        },
        set_id: (id: string) => {
            id = id;
        },
        get_children: () => {
            return new Set();
        },
        add_child: (child: Relation) => {
            return;
        },
        remove_child: (child: Relation) => {
            return;
        },
        get_parent: () => {
            return O.none;
        },
        equals: (x: Relation, y: Relation) => {
            return x.get_id() === y.get_id();
        }
    }
}

export const relation_map = (relation: Relation) => map(getEq(relation))

export function get_id(relation: Relation): string{
    return relation.get_id();
}

export function set_id(relation: Relation, id: string): void{
    relation.set_id(id);
}

export function get_children(relation: Relation): Set<Relation>{
    return relation.get_children();
}

export function add_child(relation: Relation, child: Relation): void{
    relation.add_child(child);
}

export function remove_child(relation: Relation, child: Relation): void{
    relation.remove_child(child);
}

export function get_parent(relation: Relation): O.Option<Relation>{
    return relation.get_parent();
} 

