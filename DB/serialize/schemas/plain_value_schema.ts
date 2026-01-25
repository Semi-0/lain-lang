import { register_predicate } from "generic-handler/Predicates";


export const plain_value_schema_encode = (value: any) => {
    return {
        value: value
    }
    // return value
}

export const plain_value_schema_decode = (schema: any) => {
    if (schema && schema.value !== undefined) {
        return schema.value;
    }
    else {
        console.error("plain_value_schema_decode: schema is not a plain value schema", schema);
        console.dir(schema, { depth: 20 });
        return schema;
    }
    
}