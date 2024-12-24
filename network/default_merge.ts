import { the_contradiction, the_nothing, type CellValue } from "../type";

export function default_merge(old_value: CellValue<any>, new_value: CellValue<any>): CellValue<any>{
    if (old_value === the_nothing) {
        return new_value;
    }
    else if (new_value === the_nothing) {
        return old_value;
    }
    else if (old_value === the_contradiction) {
        return old_value;
    }
    else if (new_value === the_contradiction) {
        return new_value;
    }
    else if (old_value === new_value) {
        return old_value;
    }
    else {
        return the_contradiction;
    }
}