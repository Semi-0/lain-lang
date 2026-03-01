import { CellValue, is_contradiction, the_nothing } from "ppropogator/Cell/CellValue"
import { construct_node } from "../MiniReactor/MrPrimitive"
import { combine_latest, map, subscribe, tap } from "../MiniReactor/MrCombinators"
import { cell_merge } from "ppropogator/Cell/Merge"
import { pipe } from "effect"
import { Node } from "../MiniReactor/MrType"
import { strongest_value } from "ppropogator"
import { v4 as uuidv4 } from 'uuid';
import { is_equal } from "generic-handler/built_in_generics/generic_arithmetic"



// cells
interface CellInterface{
    id: string,
    name: string,
    updater: Node<CellValue<any>>,
    strongest: Node<CellValue<any>>,
}

interface CellConstruct{
    name: string,
    content: any,
    strongest: any,
}

const make_cell_construct = (name: string, content: any, strongest: any) => {
    return {
        name,
        content,
        strongest,
    }
}


const make_cell_interface = (name: string, updater: Node<CellValue<any>>, strongest: Node<CellValue<any>>) => {
    return {
        name,
        updater,
        strongest,
    }
}


const cell_store = new Map<string, CellConstruct>()

const set_cell = (node_id: string, cell: CellConstruct) => {
    cell_store.set(node_id, cell)
}


const set_cell_content = (node_id: string, content: any) => {
    const cell = cell_store.get(node_id)
    if (cell) {
        cell.content = content
        set_cell(node_id, cell)
    }
    else {
        throw new Error("Cell not found: " + node_id)
    }
}

const handle_cell_contradiction = (node_id: string) => {
    const cell = cell_store.get(node_id)
    if (cell) {
        console.error("Cell contradiction: " + cell.name)
    }
    else {
        throw new Error("Cell not found: " + node_id)
    }

}

const set_cell_strongest = (node_id: string, strongest: any) => {
    const cell = cell_store.get(node_id)
    if (cell) {
        cell.strongest = strongest
        set_cell(node_id, cell)
    }
    else {
        throw new Error("Cell not found: " + node_id)
    }
}

export const construct_cell = (name: string) => {
    const updater = construct_node()
    const id = uuidv4()
    const strongest = construct_node()
    const cell_construct = make_cell_construct(name, the_nothing, the_nothing)
    set_cell(id, cell_construct)

    const content_node = pipe(updater,
        map((updates: any) => {
            const old_content = cell_content(id)
            const new_content = cell_merge(old_content, updates)
            return new_content
        }),
        tap((new_content: any) => {
            set_cell_content(id, new_content)
        }),
    )

    const strongest_node = pipe(content_node,
        map((content: any) => {
            const new_strongest = strongest_value(content)
            return new_strongest
        }),
        map((new_strongest: any) => {
            const old_strongest = cell_strongest(id)
            if (is_equal(new_strongest, old_strongest)) {
                // do nothing
            }
            else if (is_contradiction(new_strongest)) {
                set_cell_strongest(id, new_strongest)
                return new_strongest
            }
            else {
                set_cell_strongest(id, new_strongest)
                return new_strongest
            }
        }),
       
    )

    pipe(strongest_node,
        subscribe((new_strongest: any) => {
            if (is_contradiction(new_strongest)) {
                handle_cell_contradiction(id)
            }
        })
    )

    return updater
}

export const cell_name = (node_id: string) => {
    return cell_store.get(node_id)?.name
}

export const cell_content = (node_id: string) => {
    return cell_store.get(node_id)?.content
}

export const cell_strongest = (node_id: string) => {
    return cell_store.get(node_id)?.strongest
}


// const propagators 

// consider propagator should be hot-reloadable

// const construct_propagator = (name: string, inputs: Node<any>[], outputs: Node<any>[], internal_network: CellInterface) => {

//     const input = combine_latest(...inputs)

//     const internal_network_input = internal_network.get("network_")

// }