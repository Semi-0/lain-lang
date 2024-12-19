import { compose } from "generic-handler/built_in_generics/generic_combinator";
import { parse_AST } from "./parser";
import { eval_expr } from "./evaluator";
import { get_error_layer_value } from "sando-layer/Specified/ErrorLayer";
import { has_error_layer } from "sando-layer/Specified/ErrorLayer";
import type { LayeredObject } from "sando-layer/Basic/LayeredObject";
import * as readline from "readline"

// @ts-ignore
export const execute_repl: (str: string) => LayeredObject = compose(parse_AST, eval_expr)

export function repl(){
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    })
    rl.on("line", (str) => {
        if (str === "exit"){
            rl.close()
        }
        else{
            const result = execute_repl(str)
            if (has_error_layer(result)){
                console.log(get_error_layer_value(result))
            }
            else{
                console.log(result)
            }
    }})
}

repl()