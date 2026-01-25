/**
 * REPL command handlers for CLI applications
 * Independent version for lain-lang package
 */

import { execute_all_tasks_sequential } from "ppropogator";
import { run } from "../../compiler/compiler_entry";
import { is_cell } from "ppropogator/Cell/Cell";
import { is_string } from "generic-handler/built_in_generics/generic_predicates";
import type { LexicalEnvironment } from "../../compiler/env";
import { logger } from "./logger";

/**
 * Executes code in the given environment and handles the result
 */
export const executeCode = async (code: string, env: LexicalEnvironment): Promise<void> => {
    await execute_all_tasks_sequential(() => {});

    try {
        const result = run(code, env);
        await execute_all_tasks_sequential(() => {});

        const messages = [];
        if (is_cell(result)) {
            messages.push({ level: "success" as const, message: "✅ Compilation successful." });
            // Graph rendering is optional (requires ascii-force from eko)
            try {
                const { renderCellGraph } = await import("../../compiler/graph_renderer");
                const graphOutput = await renderCellGraph(result);
                messages.push({ level: "info" as const, message: graphOutput });
            } catch (e) {
                // Graph rendering not available, skip it
            }
        } else if (is_string(result)) {
            messages.push({ level: "info" as const, message: result });
        } else {
            messages.push({ level: "success" as const, message: "✅ Executed" });
        }
        logger.log(messages);
    } catch (e: any) {
        logger.error(`❌ Error: ${e.message || e}`);
    }
};
