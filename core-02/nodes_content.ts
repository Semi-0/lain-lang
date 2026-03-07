import { strongest_value, the_nothing } from "ppropogator";
import { create_node, node_id } from "./nodes";
import { pipe } from "effect";
import { GraphNode } from "./nodes";
import { cell_merge } from "ppropogator/Cell/Merge";
import { is_contradiction } from "ppropogator/Cell/CellValue";
import { is_equal } from "generic-handler/built_in_generics/generic_arithmetic";

interface CellConstruct{
    name: string,
    content: any,
    strongest: any,
}

const cell_store = new Map<string, CellConstruct>()

const depot_cell_construct = (node_id: string, content: any, strongest: any) => {
    cell_store.set(node_id, {
        name: node_id,
        content,
        strongest,
    });
}

const get_cell_construct = (node_id: string) => {
    const cell = cell_store.get(node_id);
    if (cell !== undefined) {
        return cell;
    }
    else {
        throw new Error("Cell not found: " + node_id);
    }
}


export const make_cell_construct = (name: string, content: any, strongest: any) => {
    const cell_construct = {
        name,
        content,
        strongest,
    }
    depot_cell_construct(name, content, strongest);
    return cell_construct;
}


const set_cell = (node_id: string, cell: CellConstruct) => {
    depot_cell_construct(node_id, cell.content, cell.strongest);
}


const cell_name = (node_id: string) => (get_cell_construct(node_id)?.name)
const cell_content = (node_id: string) => (get_cell_construct(node_id)?.content)
const cell_strongest = (node_id: string) => (get_cell_construct(node_id)?.strongest)




const set_cell_content = (node_id: string, content: any) => {
    const original_cell = get_cell_construct(node_id);
    if (original_cell !== undefined) {
        depot_cell_construct(node_id, content, original_cell.strongest);
    }
    else {
        throw new Error("Cell not found: " + node_id);
    }
}

const set_cell_strongest = (node_id: string, strongest: any) => {
    const original_cell = get_cell_construct(node_id);
    if (original_cell !== undefined) {
        depot_cell_construct(node_id, original_cell.content, strongest);
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
