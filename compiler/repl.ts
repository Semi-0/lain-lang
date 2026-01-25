import { createInterface } from "readline";
import { type LexicalEnvironment } from "./env";
import { primitive_env } from "./closure";
import { execute_all_tasks_sequential, set_merge } from "ppropogator";
import { run } from "./compiler_entry";
import { is_string } from "generic-handler/built_in_generics/generic_predicates";
import { is_cell } from "ppropogator/Cell/Cell";
import { renderCellGraphToConsole } from "./graph_renderer";
import { merge_layered } from "ppropogator/Cell/Merge";
import { init_system } from "./compiler";

type REPLOptions = {
    prompt?: string;
    welcomeMessage?: string;
    onResult?: (result: any) => void;
    onError?: (error: Error) => void;
};

const defaultREPLOptions: Required<REPLOptions> = {
    prompt: ":: lain :: > ",
    welcomeMessage: "Eko Compiler REPL\nType expressions to evaluate and see the propagation graph.",
    onResult: () => {},
    onError: (error) => console.error("Error:", error),
};

/**
 * Creates and starts an interactive REPL session.
 * Returns a cleanup function to close the REPL.
 */
export const createREPL = (
    env: LexicalEnvironment,
    options: REPLOptions = {}
): (() => void) => {
    const opts = { ...defaultREPLOptions, ...options };
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: opts.prompt,
    });


    rl.prompt();

    const handleLine = async (line: string) => {
        const code = line.trim();
        if (!code) {
            rl.prompt();
            return;
        }

        try {
            const result = run(code, env);
            await execute_all_tasks_sequential(console.error);

            if (is_string(result)) {
                console.log(result);
            } else if (is_cell(result)) {
                console.log("Compilation successful.");
                renderCellGraphToConsole(result, {});
            } else if (result) {
                console.log("Compilation successful.");
                console.log(result);
                // renderCellGraphToConsole(result, {});
            }

            opts.onResult(result);
        } catch (e) {
            const error = e instanceof Error ? e : new Error(String(e));
            opts.onError(error);
        }

        rl.prompt();
    };

    rl.on("line", handleLine);
    rl.on("close", () => {
        console.log("Bye!");
        process.exit(0);
    });

    return () => {
        rl.close();
    };
};

/**
 * Starts a REPL with a fresh environment.
 * This is the main entry point for the REPL.
 */
export const startREPL = async (options: REPLOptions = {}): Promise<void> => {
    init_system() 
    const env = primitive_env();
    createREPL(env, options);
};

/**
 * Creates a REPL with a custom environment.
 * Useful for testing or embedding the REPL in other contexts.
 */
export const createREPLWithEnv = (
    env: LexicalEnvironment,
    options: REPLOptions = {}
): (() => void) => {
    return createREPL(env, options);
};

