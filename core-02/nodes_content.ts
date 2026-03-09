import { register_predicate, strongest_value, the_nothing } from "ppropogator";
import { create_node } from "./nodes";
import { pipe } from "effect";
import { GraphNode } from "./nodes";
import { cell_merge } from "ppropogator/Cell/Merge";
import { is_contradiction } from "ppropogator/Cell/CellValue";
import { is_equal } from "generic-handler/built_in_generics/generic_arithmetic";



type NodeContent = CellConstruct | PropagatorConstruct;

interface CellConstruct {
    type: "cell",
    name: string,
    content: any,
    strongest: any,
}

interface PropagatorConstruct {
    type: "propagator",
    name: string,
    content: any,
}

const node_content_store = new Map<string, NodeContent>()

const set_node_content = (id: string, node_content: NodeContent) => {
    node_content_store.set(id, node_content);
}

const get_node_content = (id: string) => {
    return node_content_store.get(id);
}

const is_cell_construct = (id: string) => register_predicate("node_is_cell", (node_content: NodeContent) => {
    return node_content.type === "cell";
})

const is_propagator_construct = (id: string) => register_predicate("node_is_propagator", (node_content: NodeContent) => {
    return node_content.type === "propagator";
})
    


const create_cell_construct = (node_id: string, name: string, content: any, strongest: any) => {
    const cell_construct: CellConstruct = {
        name,
        type: "cell",
        content,
        strongest,
    }
    set_node_content(node_id, cell_construct);
    return cell_construct;
}

export const get_cell_construct = (node_id: string) => {
    const maybe_cell = get_node_content(node_id);
    if (maybe_cell !== undefined && is_cell_construct(node_id)) {
        return maybe_cell as CellConstruct;
    }
    else {
        throw new Error("Cell not found: " + node_id);
    }
}


export const get_propagator_construct = (node_id: string) => {
    const maybe_propagator = get_node_content(node_id);
    if (maybe_propagator !== undefined && is_propagator_construct(node_id)) {
        return maybe_propagator as PropagatorConstruct;
    }
    else {
        throw new Error("Propagator not found: " + node_id);
    }
}



const cell_name = (node_id: string) => (get_cell_construct(node_id)?.name)
const cell_content = (node_id: string) => (get_cell_construct(node_id)?.content)
const cell_strongest = (node_id: string) => (get_cell_construct(node_id)?.strongest)




const set_cell_content = (node_id: string, content: any) => {
    const original_cell = get_cell_construct(node_id);
    if (original_cell !== undefined) {
        create_cell_construct(node_id, original_cell.name, content, original_cell.strongest);
    }
    else {
        throw new Error("Cell not found: " + node_id);
    }
}

const set_cell_strongest = (node_id: string, strongest: any) => {
    const original_cell = get_cell_construct(node_id);
    if (original_cell !== undefined) {
        create_cell_construct(node_id, original_cell.name, original_cell.content, strongest);
    }
    else {
        throw new Error("Cell not found: " + node_id);
    }
}



var handle_cell_contradiction = (node_id: string) => {
    pipe(
        node_id,
        get_cell_construct,
        (cell: CellConstruct) => {
            console.error("Cell contradiction: " + cell.name);
        }
    )
}



// this is going to be refactored as cell-f or propagator-f


const cell_update_constructor =  (alert_propagators: (node_id: string) => void) =>
     (node_id: string, update: (value: any) => void) => {
    pipe(
        node_id,
        cell_content,
        (content: any) => {
            return cell_merge(content, update)
        },
        (new_content: any) => {
            set_cell_content(node_id, new_content);
            return new_content;
        },
        (new_content: any) => {
            const new_strongest = strongest_value(new_content);
            const old_strongest = cell_strongest(node_id);

            if (is_equal(new_strongest, old_strongest)) {
                // do nothing
            }
            else if (is_contradiction(new_strongest)) {
                set_cell_strongest(node_id, new_strongest);
                handle_cell_contradiction(node_id);
                alert_propagators(node_id);
            }
            else {
                set_cell_strongest(node_id, new_strongest);
                set_cell_content(node_id, new_content);
                alert_propagators(node_id);
            }
        }
    )
}

export {
    cell_name,
    cell_content,
    cell_strongest,
    set_cell_content,
    set_cell_strongest,
    cell_update_constructor,
    handle_cell_contradiction,
}
export type { CellConstruct }
