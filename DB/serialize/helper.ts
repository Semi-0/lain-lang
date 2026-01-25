import { is_boolean, is_number, is_string } from "generic-handler/built_in_generics/generic_predicates";
import { is_nothing } from "ppropogator";
import { is_contradiction } from "ppropogator";

export const is_self_evaluating = (x: any) => is_string(x) || is_number(x) || is_boolean(x) || is_nothing(x) || is_contradiction(x);