import { get_time_layer_value, has_time_layer, time_layer } from "sando-layer/Specified/TimeLayer";
import { construct_vector_clock, get_vector_clock_layer, has_vector_clock_layer, merge_vector_clocks, vector_clock_forward, vector_clock_layer } from "ppropogator/AdvanceReactivity/vector_clock";
import { Cell, cell_id, cell_strongest, is_contradiction, match_args, register_predicate, strongest, strongest_value, the_contradiction, the_nothing } from "ppropogator";
import { is_layered_object, LayeredObject } from "sando-layer/Basic/LayeredObject";
import { BetterSet, is_better_set } from "generic-handler/built_in_generics/generic_better_set";
import { every, first, for_each, length, reduce, rest } from "generic-handler/built_in_generics/generic_collection";
import { define_generic_procedure_handler } from "generic-handler/GenericProcedure";
import { greater_than, less_than } from "generic-handler/built_in_generics/generic_arithmetic";
import { define_layered_procedure_handler, make_layered_procedure } from "sando-layer/Basic/LayeredProcedure";
import { update_cell } from "ppropogator/Cell/Cell";
import { construct_layered_datum } from "sando-layer/Basic/LayeredDatum";



const get_wallclock_timestamp = get_time_layer_value
const get_vector_clock = get_vector_clock_layer 


// the specialize runtime would enable that for strongest value 
// that have multiple vector clocks and wallclock timestamps,
// the strongest value of a cell would merge the vector clock with wallclock
export const init_specialized_reactive_runtime = () => {

    const is_latest_win_reactive_value = register_predicate(
        "is_latest_win_reactive_value",
        (a: any) => {
            return is_layered_object(a) && has_vector_clock_layer(a) && has_time_layer(a);
        }
    )

    const is_latest_win_reactive_value_set = register_predicate(
        "is_latest_win_reactive_value_set",
        (a: any) => {
            return is_better_set(a) && every(a, is_latest_win_reactive_value);
        }
    )

    const walltime_greater_than = (a: LayeredObject<any>, b: LayeredObject<any>) => {
        return get_wallclock_timestamp(a) > get_wallclock_timestamp(b)
    }
    const walltime_less_than = (a: LayeredObject<any>, b: LayeredObject<any>) => {
        return get_wallclock_timestamp(a) < get_wallclock_timestamp(b)
    }

    const merge_vector_clock_from = make_layered_procedure(
        "merge_vector_clock_from",
        2,
        (a: LayeredObject<any>, b: LayeredObject<any>) => {
            return a
        }
    )

    define_layered_procedure_handler(
        merge_vector_clock_from,
        vector_clock_layer,
        (base: any, a: LayeredObject<any>, b: LayeredObject<any>) => {
            const vector_clock_a = get_vector_clock(a)
            const vector_clock_b = get_vector_clock(b)
            return merge_vector_clocks(vector_clock_a, vector_clock_b)
        }
    )

    // use the same merge function from temporary value set
    // but use walltime clock to aids when we can't decides which is stronger
    define_generic_procedure_handler(
        strongest_value,
        match_args(is_latest_win_reactive_value_set),
        (set: BetterSet<LayeredObject<any>>) => {
            if (length(set) === 0) {
                return the_nothing
            }
            else {
                return reduce(rest(set), (acc: LayeredObject<any>, value: LayeredObject<any>) => {
                      if (is_contradiction(acc)) {
                        return merge_vector_clock_from(acc, value)
                      }
                      else if (walltime_greater_than(value, acc)) {
                        return merge_vector_clock_from(value, acc)
                      }
                      else if (walltime_less_than(value, acc)) {
                        return merge_vector_clock_from(acc, value)
                      }
                      else {
                        return merge_vector_clock_from(the_contradiction, acc)
                      }
                }, first(set))
            }

        }
    )
    // i want to have a strongest value 
    // but execution order matters 
    // because we need to ensure that the strongest value is installed
    // before the other value are installed 
}

const has_source_clock_channel = (obj: LayeredObject<any>, cell: Cell<any>) => {
    const vector_clock = get_vector_clock(obj)
    const identifier = cell_id(cell)
    return vector_clock.has(identifier)
}


export const update_specialized_reactive_value = (cell: Cell<any>, identifier: string, value: any) => {
    const strongest = cell_strongest(cell)
    const walltime = performance.now()
    if ((is_layered_object(strongest)) && (has_source_clock_channel(strongest, cell))) {
        const vector_clock = get_vector_clock(strongest)
      
        update_cell(cell,
          construct_layered_datum(
            value,
            vector_clock_layer,
            vector_clock_forward(vector_clock, identifier),
            time_layer,
            walltime
          )
        )
    }
    else {
        update_cell(cell,
            construct_layered_datum(
                value,
                vector_clock_layer,
                construct_vector_clock([
                    {
                        source: identifier,
                        value: 0
                    }
                ]),
                time_layer,
                walltime
            )
        )
    }

}