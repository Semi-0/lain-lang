import {
    type Cell,
    p_add,
    p_subtract,
    p_multiply,
    p_divide,
    p_greater_than,
    p_less_than,
    p_equal,
    cell_strongest,
    construct_propagator,
} from "ppropogator";
import { p_greater_than_or_equal, p_less_than_or_equal, bi_sync, p_sync } from "ppropogator/Propagator/BuiltInProps";
import { socket_IO_client_cell } from "ppropogator/Cell/RemoteCell/SocketClientCell";
import { socket_IO_server_cell } from "ppropogator/Cell/RemoteCell/SocketServerCell";
import { forward } from "ppropogator/Propagator/HelperProps";
import { any_unusable_values } from "ppropogator/Cell/CellValue";
import { construct_env_with_inital_value } from "../../env";
import { make_primitive, make_two_arity_primitive } from "../base";
import { graph_special_primitive_specs } from "./graph";
import { datalog_special_primitive_specs } from "./datalog";
import type { SpecialPrimitiveSpec } from "./types";

export type { PropagatorConstructor, SpecialPrimitiveSpec } from "./types";
export { graph_special_primitive_specs } from "./graph";
export { datalog_special_primitive_specs, make_query_pattern, is_query_pattern, type QueryPattern } from "./datalog";

export const two_arity_prims: [string, any][] = [
    ["+", p_add],
    ["-", p_subtract],
    ["*", p_multiply],
    ["/", p_divide],
    [">", p_greater_than],
    ["<", p_less_than],
    [">=", p_greater_than_or_equal],
    ["<=", p_less_than_or_equal],
    ["==", p_equal],
];

export const p_socket_client = (name: Cell<string>, host: Cell<string>, port: Cell<number>, input: Cell<any>, output: Cell<any>) => {
    let created = false;
    return construct_propagator(
        [name, host, port, input],
        [output],
        () => {
            if (created) return;
            const n = cell_strongest(name);
            const h = cell_strongest(host);
            const p = cell_strongest(port);

            if (!any_unusable_values([n, h, p])) {
                created = true;
                // @ts-ignore
                socket_IO_client_cell(n, h, p).then((sc) => {
                    forward([input], [sc]);
                    forward([sc], [output]);
                });
            }
        },
        "p_socket_client"
    );
};

export const p_socket_server = (name: Cell<string>, port: Cell<number>, input: Cell<any>, output: Cell<any>) => {
    let created = false;
    return construct_propagator(
        [name, port, input],
        [output],
        () => {
            if (created) return;
            const n = cell_strongest(name);
            const p = cell_strongest(port);

            if (!any_unusable_values([n, p])) {
                created = true;
                // @ts-ignore
                socket_IO_server_cell(n, p).then((sc) => {
                    forward([input], [sc]);
                    forward([sc], [output]);
                });
            }
        },
        "p_socket_server"
    );
};

/**
 * Returns an array of all primitive operator names.
 * This includes two-arity primitives and special primitives.
 * Note: "parent" is a special key used by the environment system, not a primitive operator.
 */
export const get_primitive_keys = (): string[] => {
    const twoArityNames = two_arity_prims.map(([name]) => name);
    const specialPrimitives = ["bi_sync", "socket-client", "socket-server"];
    return [...twoArityNames, ...specialPrimitives];
};

const core_special_primitive_specs: readonly SpecialPrimitiveSpec[] = [
    { key: "<->", as: "bi_sync", inputs: 0, outputs: 2, constructor: bi_sync },
    { key: "->", inputs: 1, outputs: 1, constructor: p_sync },
    { key: "socket:client", inputs: 5, outputs: 0, constructor: p_socket_client },
    { key: "socket:server", inputs: 4, outputs: 0, constructor: p_socket_server },
];

/** All non–two-arity primitives for `primitive_env`, in registration order (core, graph, datalog). */
export const special_primitive_specs: readonly SpecialPrimitiveSpec[] = [
    ...core_special_primitive_specs,
    ...graph_special_primitive_specs,
    ...datalog_special_primitive_specs,
];

const spec_to_entry = (s: SpecialPrimitiveSpec): [string, Cell<any>] => [
    s.key,
    make_primitive(s.as ?? s.key, s.inputs, s.outputs, s.constructor),
];

export const primitive_env = (id: string = "root") => {
    const primitives: [string, Cell<any>][] = [
        ...two_arity_prims.map(
            ([name, constructor]): [string, Cell<any>] =>
                // @ts-ignore
                [name, make_two_arity_primitive(name, constructor)]
        ),
        ...special_primitive_specs.map(spec_to_entry),
    ];
    return construct_env_with_inital_value(primitives, id);
};
