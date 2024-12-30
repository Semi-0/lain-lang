import { reference_store } from "../shared/helper";

type Observer = {
    id: string,
    children: ((update: any) => void)[],
    update: (update: any) => void,
    subscribe: (subscriber: (update: any) => void) => void,
    dispose: () => void,
}

const get_new_id = reference_store();

export function create_observer(): Observer{

    const id = get_new_id();
    var children: ((update: any) => void)[] = [];

    const observer: Observer = {
        id: id.toString(),
        children: children,
        update: (update: any) => {
            children.forEach(child => {
                child(update);
            });
        },
        subscribe: (subscriber: (update: any) => void) => {
            children.push(subscriber);
        },
        dispose: () => {
            children = [];
        }
    }
    return observer;
}


// type Global_Env = Map<string, any>;

// export function empty_global_env(): Global_Env{
//     return {

//     }
// }