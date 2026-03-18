import { LayeredObject } from "sando-layer/Basic/LayeredObject";
import { layer_accessor, make_annotation_layer } from "sando-layer/Basic/Layer";
import { internal_mark_migrated_layered_procedure_handler } from "sando-layer/Basic/LayeredProcedure";
export const walltime_clock_layer = make_annotation_layer(
    "walltime",
    (
        get_name: () => string,
        has_value: (object: any) => boolean,
        get_value: (object: any) => any,
        summarize_self: () => string[],
    ) => {
        function get_default_value(): number {
            return 0;
        }

        function get_procedure(_name: string, _arity: number): any | undefined {
            const handler = (_base: any, ...obj: LayeredObject<any>[]) => {
                const timestamps = obj.map(get_value);
                return Math.max(...timestamps);
            };

            internal_mark_migrated_layered_procedure_handler(handler)

            return handler;
        }

        return {
            get_name,
            has_value,
            get_value,
            get_default_value,
            get_procedure,
            summarize_self,
        };
    },
);

export const get_wallclock_timestamp = layer_accessor(walltime_clock_layer);

export const has_walltime_clock_layer = (obj: LayeredObject<any>): boolean =>
    walltime_clock_layer.has_value(obj);

