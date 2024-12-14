// default network to make cells
import type { Cell, Propagator } from "../type";
import { construct_propagator } from "./propagator";
import { is_contradiction, is_nothing } from "../shared/predicates";
import { construct_primitive_cell } from "./cell";
import { the_contradiction } from "../type";

