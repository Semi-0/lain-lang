import { to_string } from "generic-handler/built_in_generics/generic_conversation";

export function reference_store(){
    var reference = 0;

    return () =>{
        let r = reference;
        reference += 1;
        return r;
    }
}

export function throw_unimplemented(){
    return (...args: any[]) => {
        throw new Error("Unimplemented:" + to_string(args))
    }
}