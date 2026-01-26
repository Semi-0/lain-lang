/**
 * Peer CLI - Main entry point for running a peer client
 * Independent version for lain-lang package
 * 
 * Usage: `bun run lain-peer`
 */

import { createInterface } from "readline";
import { logger, batch_log, create_log_messages } from "./logger";
import { create_peer } from "./peer_commands";
import {
    type PeerManagerState,
    show_menu,
    update_prompt,
    handle_new_command,
    handle_use_command,
    handle_close_command,
    handle_env_command,
    handle_exit_command,
    handle_code_execution,
} from "./peer_command_handlers";
import { cleanup } from "../p2p/setup";
import { NETWORK } from "../p2p/constants";

const DEFAULT_HTTP_PORT = NETWORK.DEFAULT_HTTP_PORT_PEER;
const DEFAULT_MULTICAST_PORT = NETWORK.DEFAULT_MULTICAST_PORT;
const DEFAULT_HOST_PEER = `http://localhost:${NETWORK.DEFAULT_HTTP_PORT_HOST}/gun`;

const setup_command_handlers = (state: PeerManagerState): void => {
    state.rl.on("line", async (line: string) => {
        const input = line.trim();
        if (!input) {
            state.rl.prompt();
            return;
        }

        const parts = input.split(/\s+/);
        const command = parts[0].toLowerCase();

        if (command === "new" || command === "n") {
            await handle_new_command(state, parts);
        } else if (command === "use" && parts.length > 1) {
            handle_use_command(state, parts);
        } else if (command === "list" || command === "l") {
            show_menu(state);
            update_prompt(state);
            state.rl.prompt();
        } else if (command === "close" && parts.length > 1) {
            handle_close_command(state, parts);
        } else if (command === "/env" || command === "env") {
            handle_env_command(state);
        } else if (command === "exit" || command === "quit" || command === "q") {
            handle_exit_command(state);
        } else {
            await handle_code_execution(state, input);
        }
    });

    state.rl.on("close", () => {
        logger.info(`\n👋 Shutting down Peer Manager...`);
        state.peers.forEach(peer => {
            if (peer.active) {
                cleanup(peer.setup);
            }
        });
        process.exit(0);
    });
};

const initialize_first_peer = async (state: PeerManagerState): Promise<void> => {
    try {
        const firstPeer = await create_peer(
            state.rl,
            1,
            DEFAULT_HTTP_PORT,
            DEFAULT_MULTICAST_PORT,
            DEFAULT_HOST_PEER
        );
        state.peers.push(firstPeer);
        state.currentPeerId = 1;
        batch_log(create_log_messages(
            { level: "success", message: `\n✅ First peer created! Use 'new' command to create more peers.` },
            { level: "info", message: `💡 Type code at the prompt to execute it in the shared environment.\n` }
        ));
        update_prompt(state);
    } catch (e) {
        logger.error(`❌ Failed to create first peer: ${e}`);
    }
};

export const run_client = async () => {
    batch_log(create_log_messages(
        { level: "info", message: `🚀 Lain Peer Manager` },
        { level: "info", message: `═══════════════════════════════════════\n` }
    ));

    const mainRl = createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    const state: PeerManagerState = {
        peers: [],
        currentPeerId: null,
        rl: mainRl,
    };

    show_menu(state);
    update_prompt(state);
    mainRl.prompt();

    setup_command_handlers(state);
    await initialize_first_peer(state);

    return state.peers;
};

if (import.meta.main) {
    run_client();
}
