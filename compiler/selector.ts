import { type Cell, construct_propagator } from "ppropogator";
import { cell_strongest, update_cell } from "ppropogator/Cell/Cell";
import { is_unusable_value } from "ppropogator/Cell/CellValue";
import { curried_for_each, curried_map } from "ppropogator/Helper/Helper";
import { pipe } from "effect";


export const select_cell_has_value : (cells: Cell<any>[]) => Cell<any>[] = (cells: Cell<any>[]) => {
    if (cells.length === 0) {
        return []
    }
    else {
        const fst = cells[0];
        if (is_unusable_value(cell_strongest(fst))) {
            // go to next
            return select_cell_has_value(cells.slice(1));
        }
        else {
            return [fst];
        }
    }
}


export const p_pioritize_leftmost = (cells: Cell<any>[],output: Cell<any>) => construct_propagator(
    cells,
    [output],
    () => {
        pipe(
            cells,
            select_cell_has_value,
            curried_for_each((cell: Cell<any>) => update_cell(output, cell_strongest(cell)))
        )
    },
 "pioritize_leftmost")
