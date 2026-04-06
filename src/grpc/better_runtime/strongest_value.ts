import { Cell, cell_strongest, get_base_value, is_contradiction, match_args, register_predicate, strongest_value, the_contradiction, the_nothing } from "ppropogator";
import {
    construct_vector_clock,
    get_vector_clock_layer,
    has_vector_clock_layer,
    merge_vector_clocks,
    vector_clock_forward,
    vector_clock_layer,
} from "ppropogator/AdvanceReactivity/vector_clock";
import { is_layered_object, LayeredObject } from "sando-layer/Basic/LayeredObject";
import { BetterSet, is_better_set } from "generic-handler/built_in_generics/generic_better_set";
import { every, first, length, reduce, rest } from "generic-handler/built_in_generics/generic_collection";
import { extend_layered_procedure, make_layered_procedure } from "sando-layer/Basic/LayeredProcedure";
import { define_generic_procedure_handler } from "generic-handler/GenericProcedure";
import { update_cell } from "ppropogator/Cell/Cell";
import { construct_layered_datum } from "sando-layer/Basic/LayeredDatum";

import {
    get_wallclock_timestamp,
    has_walltime_clock_layer,
    walltime_clock_layer,
} from "./layers";

const get_vector_clock = get_vector_clock_layer;

const walltime_greater_than = (a: LayeredObject<any>, b: LayeredObject<any>) =>
    get_wallclock_timestamp(a) > get_wallclock_timestamp(b);

const walltime_less_than = (a: LayeredObject<any>, b: LayeredObject<any>) =>
    get_wallclock_timestamp(a) < get_wallclock_timestamp(b);

const merge_vector_clock_from = make_layered_procedure(
    "merge_vector_clock_from",
    2,
    (a: LayeredObject<any>, _b: LayeredObject<any>) => {
        return a;
    },
);

extend_layered_procedure(
    merge_vector_clock_from,
    vector_clock_layer,
    (_base: any, a: LayeredObject<any>, b: LayeredObject<any>) => {
        const vector_clock_a = get_vector_clock(a);
        const vector_clock_b = get_vector_clock(b);
        return merge_vector_clocks(vector_clock_a, vector_clock_b);
    },
);

const has_source_clock_channel = (obj: LayeredObject<any>, identifier: string) => {
    const vector_clock = get_vector_clock(obj);
    return vector_clock.has(identifier);
};

export const init_specialized_reactive_runtime = () => {
    const is_latest_win_reactive_value = register_predicate(
        "is_latest_win_reactive_value",
        (a: any) => {
            return is_layered_object(a) && has_vector_clock_layer(a) && has_walltime_clock_layer(a);
        },
    );

    const is_latest_win_reactive_value_set = register_predicate(
        "is_latest_win_reactive_value_set",
        (a: any) => {
            return is_better_set(a) && every(a, is_latest_win_reactive_value);
        },
    );

    define_generic_procedure_handler(
        strongest_value,
        match_args(is_latest_win_reactive_value_set),
        (set: BetterSet<LayeredObject<any>>) => {
            if (length(set) === 0) {
                return the_nothing;
            } else {
                const result = reduce(
                    rest(set),
                    (acc: LayeredObject<any>, value: LayeredObject<any>) => {
                        if (is_layered_object(acc as any) && is_contradiction(get_base_value(acc as any))) {
                            // Layered contradiction: allow a strictly newer value to supersede it
                            if (has_walltime_clock_layer(value) && get_wallclock_timestamp(value) > get_wallclock_timestamp(acc)) {
                                return merge_vector_clock_from(value, acc);
                            }
                            return acc;
                        } else if (is_contradiction(acc)) {
                            // Plain contradiction: cannot recover
                            return acc;
                        } else if (walltime_greater_than(value, acc)) {
                            return merge_vector_clock_from(value, acc);
                        } else if (walltime_less_than(value, acc)) {
                            return merge_vector_clock_from(acc, value);
                        } else {
                            // Same walltime → contradiction, but preserve walltime for future supersession
                            return construct_layered_datum(
                                the_contradiction,
                                walltime_clock_layer,
                                get_wallclock_timestamp(acc),
                                vector_clock_layer,
                                merge_vector_clocks(get_vector_clock(acc), get_vector_clock(value))
                            );
                        }
                    },
                    first(set),
                );

                return result;
            }
        },
    );
};

export const update_specialized_reactive_value = (
    cell: Cell<any>,
    identifier: string,
    value: any,
) => {
    const strongest = cell_strongest(cell);
    const walltime = performance.now();

    if (is_layered_object(strongest) && has_source_clock_channel(strongest, identifier)) {
        const vector_clock = get_vector_clock(strongest);

        update_cell(
            cell,
            construct_layered_datum(
                value,
                vector_clock_layer,
                vector_clock_forward(vector_clock, identifier),
                walltime_clock_layer,
                walltime,
            ),
        );
    } else {
        update_cell(
            cell,
            construct_layered_datum(
                value,
                vector_clock_layer,
                construct_vector_clock([
                    {
                        source: identifier,
                        value: 0,
                    },
                ]),
                walltime_clock_layer,
                walltime,
            ),
        );
    }
};

