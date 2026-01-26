/**
 * Host CLI - Main entry point for running a host server
 * Independent version for lain-lang package
 * 
 * Usage: `bun run lain-host`
 */

import { createInterface } from "readline";
import { cell_id } from "ppropogator/Cell/Cell";
import { setupHost, cleanup } from "../p2p/setup";
import { verify_environment, log_environment_verification } from "../p2p/verification";
import { ENV, NETWORK } from "../p2p/constants";
import { logger, batch_log, create_log_messages } from "./logger";
import { execute_code } from "./repl_handlers";
import { source_cell } from "ppropogator/DataTypes/PremisesSource";

const ENV_ID = ENV.DEFAULT_ENV_ID;
const MULTICAST_PORT = NETWORK.DEFAULT_MULTICAST_PORT;
const HTTP_PORT = NETWORK.DEFAULT_HTTP_PORT_HOST;
const source = source_cell("host");

const setup_repl = (env: any) => {
    const rl = createInterface({
        input: process.stdin,
        output: process.stdout,
        prompt: "lain-host> ",
    });

    rl.prompt();

    rl.on("line", async (line: string) => {
        const code = line.trim();
        if (!code) {
            rl.prompt();
            return;
        }
        await execute_code(code, env, source);
        rl.prompt();
    });

    rl.on("close", () => {
        logger.info("\n👋 Shutting down Lain Host...");
        process.exit(0);
    });

    return rl;
};

const log_startup_messages = (verification: any, cellId: string) => {
    const messages = create_log_messages(
        { level: "info", message: `   - Cell ID: ${cellId}` },
        { level: "info", message: `\n🎯 Ready to accept code execution requests!` },
        { level: "info", message: `💡 Type code at the prompt to execute it in the shared environment.\n` }
    );
    
    if (verification.userKeys.length > 0) {
        messages.push({
            level: "warn",
            message: `⚠️  WARNING: Environment not empty! Found user bindings: ${verification.userKeys.join(", ")}`
        });
    }
    
    batch_log(messages);
};

export const start_server = async (httpPort: number = HTTP_PORT, multicastPort: number = MULTICAST_PORT) => {
    logger.info(`🚀 Initializing Lain Host...`);
    
    const setup = await setupHost({
        httpPort,
        multicastPort,
        envId: ENV_ID,
        enableTrace: true,
    });

    const { env } = setup;
    
    // Verify environment
    const verification = verify_environment(env);
    log_environment_verification(verification);
    log_startup_messages(verification, cell_id(env));

    // Setup REPL
    const rl = setup_repl(env);
    
    // Store cleanup function for REPL close handler
    (rl as any)._cleanup = () => cleanup(setup);

    return setup;
};

if (import.meta.main) {
    start_server().catch(console.error);
}
