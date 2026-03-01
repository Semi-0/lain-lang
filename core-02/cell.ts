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

export const make_cell_construct = (name: string, content: any, strongest: any) => {
    return {
        name,
        content,
        strongest,
    }
}

const cell_store = new Map<string, CellConstruct>();

const set_cell = (node_id: number, cell: CellConstruct) => {
    cell_store.set(node_id, cell);
}

const cell_name = (node_id: number) => (cell_store.get(node_id)?.name)
const cell_content = (node_id: number) => (cell_store.get(node_id)?.content)
const cell_strongest = (node_id: number) => (cell_store.get(node_id)?.strongest)

const set_cell_content = (node_id: number, content: any) => {
    const original_cell = get_cell(node);
    if (original_cell !== undefined) {
        original_cell.content = content;
        set_cell(node, original_cell);
    }
    else {
        throw new Error("Cell not found: " + node_id(node));
    }
}

const set_cell_strongest = (node: GraphNode, strongest: any) => {
    const original_cell = get_cell(node);
    if (original_cell !== undefined) {
        original_cell.strongest = strongest;
        set_cell(node, original_cell);
    }
    else {
        throw new Error("Cell not found: " + node_id(node));
    }
}



const get_cell = (node: GraphNode): CellConstruct => {
        const cell = cell_store.get(node_id(node));
    if (cell !== undefined) {
        return cell;
    }
    else {
        throw new Error("Cell not found: " + node_id(node));
    }
}


var handle_cell_contradiction = (node: GraphNode) => {
    pipe(
        node,
        get_cell,
        (cell: CellConstruct) => {
            console.error("Cell contradiction: " + cell_name(node));
        }
    )
}

const create_cell = (name: string): GraphNode => {
    const node = create_node(name);
    const cell = {
        name,
        content: the_nothing,
        strongest: the_nothing
    }
    cell_store.set(name, cell);
    return node;
}

const cell_update_constructor =  (alert_propagators: (node: GraphNode) => void) =>
     (node: GraphNode, update: (value: any) => void) => {
    pipe(
        node,
        cell_content,
        (content: any) => {
            return cell_merge(content, update)
        },
        (new_content: any) => {
            set_cell_content(node, new_content);
            return new_content;
        },
        (new_content: any) => {
            const new_strongest = strongest_value(new_content);
            const old_strongest = cell_strongest(node);

            if (is_equal(new_strongest, old_strongest)) {
                // do nothing
            }
            else if (is_contradiction(new_strongest)) {
                set_cell_strongest(node, new_strongest);
                handle_cell_contradiction(node);
                alert_propagators(node);
            }
            else {
                set_cell_strongest(node, new_strongest);
                set_cell_content(node, new_content);
                alert_propagators(node);
            }
        }
    )
}

export {
    create_cell,
    cell_name,
    cell_content,
    cell_strongest,
    set_cell_content,
    set_cell_strongest,
    cell_update_constructor,
    handle_cell_contradiction,
}
export type { CellConstruct }
