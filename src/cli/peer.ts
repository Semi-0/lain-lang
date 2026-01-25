/**
 * Peer CLI - Main entry point for running a peer client
 * Independent version for lain-lang package
 */

import { createInterface } from "readline";
import { logger, batchLog, createLogMessages } from "./logger";
import { createPeer } from "./peer_commands";
import {
    type PeerManagerState,
    showMenu,
    updatePrompt,
    handleNewCommand,
    handleUseCommand,
    handleCloseCommand,
    handleEnvCommand,
    handleExitCommand,
    handleCodeExecution,
} from "./peer_command_handlers";
import { cleanup } from "../p2p/setup";
import { NETWORK } from "../p2p/constants";

const DEFAULT_HTTP_PORT = NETWORK.DEFAULT_HTTP_PORT_PEER;
const DEFAULT_MULTICAST_PORT = NETWORK.DEFAULT_MULTICAST_PORT;
const DEFAULT_HOST_PEER = `http://localhost:${NETWORK.DEFAULT_HTTP_PORT_HOST}/gun`;

const setupCommandHandlers = (state: PeerManagerState): void => {
    state.rl.on("line", async (line: string) => {
        const input = line.trim();
        if (!input) {
            state.rl.prompt();
            return;
        }

        const parts = input.split(/\s+/);
        const command = parts[0].toLowerCase();

        if (command === "new" || command === "n") {
            await handleNewCommand(state, parts);
        } else if (command === "use" && parts.length > 1) {
            handleUseCommand(state, parts);
        } else if (command === "list" || command === "l") {
            showMenu(state);
            updatePrompt(state);
            state.rl.prompt();
        } else if (command === "close" && parts.length > 1) {
            handleCloseCommand(state, parts);
        } else if (command === "/env" || command === "env") {
            handleEnvCommand(state);
        } else if (command === "exit" || command === "quit" || command === "q") {
            handleExitCommand(state);
        } else {
            await handleCodeExecution(state, input);
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

const initializeFirstPeer = async (state: PeerManagerState): Promise<void> => {
    try {
        const firstPeer = await createPeer(
            state.rl,
            1,
            DEFAULT_HTTP_PORT,
            DEFAULT_MULTICAST_PORT,
            DEFAULT_HOST_PEER
        );
        state.peers.push(firstPeer);
        state.currentPeerId = 1;
        batchLog(createLogMessages(
            { level: "success", message: `\n✅ First peer created! Use 'new' command to create more peers.` },
            { level: "info", message: `💡 Type code at the prompt to execute it in the shared environment.\n` }
        ));
        updatePrompt(state);
    } catch (e) {
        logger.error(`❌ Failed to create first peer: ${e}`);
    }
};

export const runClient = async () => {
    batchLog(createLogMessages(
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

    showMenu(state);
    updatePrompt(state);
    mainRl.prompt();

    setupCommandHandlers(state);
    await initializeFirstPeer(state);

    return state.peers;
};

if (import.meta.main) {
    runClient();
}
