/**
 * REPL command handlers for CLI applications
 * Independent version for lain-lang package
 */

import { execute_all_tasks_sequential } from "ppropogator";
import { run } from "../../compiler/compiler_entry";
import { is_cell, type Cell } from "ppropogator/Cell/Cell";
import { is_string } from "generic-handler/built_in_generics/generic_predicates";
import type { LexicalEnvironment } from "../../compiler/env";
import { logger, type LogMessage } from "./logger";
import { renderCellGraph } from "../../compiler/graph_renderer";

/**
 * Executes code in the given environment and handles the result
 */
export const execute_code = async (code: string, env: LexicalEnvironment, source: Cell<any> | undefined = undefined, timestamp: number | undefined = undefined): Promise<void> => {
    await execute_all_tasks_sequential(() => {});

    try {
        const result = run(code, env, source, timestamp);
        await execute_all_tasks_sequential(() => {});

        const messages: LogMessage[] = [];
        if (is_cell(result)) {
            messages.push({ level: "success", message: "✅ Compilation successful." });
            try {
                const graphOutput = await renderCellGraph(result);
                messages.push({ level: "info", message: graphOutput });
            } catch (e) {
                const errorMsg = e instanceof Error ? e.message : String(e);
                messages.push({ level: "warn", message: `Graph rendering error: ${errorMsg}` });
            }
        } else if (is_string(result)) {
            messages.push({ level: "info", message: result });
        } else {
            messages.push({ level: "success", message: "✅ Executed" });
        }
        logger.log(messages);
    } catch (e) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        logger.error(`❌ Error: ${errorMessage}`);
    }
};
