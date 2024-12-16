import { construct_simple_generic_procedure, define_generic_procedure_handler } from "generic-handler/GenericProcedure";
import { match_args, register_predicate } from "generic-handler/Predicates";
import type { Propagator } from "../type";
import type { Cell } from "../type";



const dispose = construct_simple_generic_procedure("dispose", 1,
    (x: any) => {
        throw new Error("dispose is not implemented")
    }
);

const is_cell = register_predicate("is_cell", (x: any) => {
    return x !== undefined && x !== null && typeof x === "object" 
            && x.id !== undefined && typeof x.id === "string"
            && x.name !== undefined && typeof x.name === "string"
            && x.value !== undefined && typeof x.value === "object"
            && x.neighbors !== undefined && Array.isArray(x.neighbors);
});

const is_propagator = register_predicate("is_propagator", (x: any) => {
    return x !== undefined && x !== null && typeof x === "object" 
            && x.id !== undefined && typeof x.id === "string"
            && x.name !== undefined && typeof x.name === "string"
            && x.inputs !== undefined && Array.isArray(x.inputs)
            && x.outputs !== undefined && Array.isArray(x.outputs)
            && x.activate !== undefined && typeof x.activate === "function";
});

define_generic_procedure_handler(dispose, match_args(is_cell), 
(x: Cell<any>) => {
    x.neighbors.forEach((neighbor: Propagator) => {
       neighbor.inputs = neighbor.inputs.filter(n => n !== x);
    });

    x.neighbors = [];
})

define_generic_procedure_handler(dispose, match_args(is_propagator), 
(x: Propagator) => {
    x.inputs.forEach((cell: Cell<any>) => {
        cell.neighbors = cell.neighbors.filter(n => n !== x);
    });

    x.inputs = [];
    x.outputs = [];
})


