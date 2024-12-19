export function reference_store(){
    var reference = 0;

    return () =>{
        let r = reference;
        reference += 1;
        return r;
    }
}

export function throw_unimplemented(){
    return () => {
        throw new Error("Unimplemented")
    }
}