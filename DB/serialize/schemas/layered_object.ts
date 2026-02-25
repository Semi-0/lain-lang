// ============================================================================
// LAYERED OBJECT SCHEMA ENCODING
// ============================================================================

import { for_each } from "generic-handler/built_in_generics/generic_collection";
import { register_predicate } from "generic-handler/Predicates";
import { vector_clock_layer } from "sando-layer/Specified/VectorClockLayer";
import { support_layer } from "sando-layer/Specified/SupportLayer";
import { construct_layered_datum } from "sando-layer/Basic/LayeredDatum";
import { LayeredObject } from "sando-layer/Basic/LayeredObject";
import { get_base_value } from "sando-layer/Basic/Layer";
import { IGunInstance } from "gun";
import { log_tracer } from "generic-handler/built_in_generics/generic_debugger";
import { trace_generic_procedure } from "generic-handler/GenericProcedure";

type EncodeFn = (x: any) => any;

export const is_layered_object_schema = register_predicate("is_layered_object_schema", (a: any) => a && a.type === "layered_object");

export const layered_object_schema = (object: LayeredObject<any>, encode: EncodeFn): Record<string, any> => {
    const annotation_layers = object.annotation_layers();
    const record: Record<string, any> = { 
        type:"layered_object",
        base: encode(get_base_value(object))
    };
    for_each(annotation_layers, (layer) => {
        record[layer.get_name()] = encode(object.get_layer_value(layer));
    });
    return record;
};

export const layered_object_schema_decode = (gun: IGunInstance, schema: Record<string, any>, decode: (x: any, gun: IGunInstance) => any): LayeredObject<any> => {
    const record = schema;
    return construct_layered_datum(
        decode(record.base, gun),
        ...Object.entries(record).filter(
            ([key, value]) => 
                key !== "type" && 
                key !== "base_value" &&
                key !== "base"
            ).flatMap(([key, value]) => {
              if (key === "vector_clock") {
                return [vector_clock_layer, decode(value, gun)]
              }
              else if (key === "support") {
                return [support_layer, decode(value, gun)]
              }
              else {
                // For other layers, try to find them or handle appropriately
                // For now, let's just log and skip if unknown
                // console.warn("layered_object_schema_decode", "Unknown layer:", key);
                return [];
              }
            }),
    )
}
