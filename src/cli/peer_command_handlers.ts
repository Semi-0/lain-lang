/**
 * Command handlers for peer CLI manager
 * Independent version for lain-lang package
 */

import type { Interface } from "readline";
import { summarize_env } from "../../compiler/env";
import { cleanup } from "../p2p/setup";
import { logger, batch_log, create_log_messages } from "./logger";
import { create_peer, execute_code_on_peer, type PeerInstance } from "./peer_commands";
import { NETWORK } from "../p2p/constants";

const DEFAULT_HTTP_PORT = NETWORK.DEFAULT_HTTP_PORT_PEER;
const DEFAULT_MULTICAST_PORT = NETWORK.DEFAULT_MULTICAST_PORT;
const DEFAULT_HOST_PEER = `http://localhost:${NETWORK.DEFAULT_HTTP_PORT_HOST}/gun`;

export interface PeerManagerState {
    peers: PeerInstance[];
    currentPeerId: number | null;
    rl: Interface;
}

export const get_current_peer = (state: PeerManagerState): PeerInstance | null => {
    if (state.currentPeerId === null) return null;
    return state.peers.find(p => p.id === state.currentPeerId && p.active) || null;
};

export const show_menu = (state: PeerManagerState): void => {
    const activePeers = state.peers.filter(p => p.active);
    const messages = create_log_messages(
        { level: "info", message: `\n📋 Active Peers: ${activePeers.length}` }
    );
    
    activePeers.forEach(peer => {
        const marker = state.currentPeerId === peer.id ? "👉" : "  ";
        messages.push({
            level: "info",
            message: `${marker} Peer ${peer.id}: HTTP ${peer.httpPort}, Multicast ${peer.multicastPort}, Host: ${peer.hostPeer}`
        });
    });
    
    if (state.currentPeerId !== null) {
        messages.push({ level: "info", message: `\n🎯 Currently using Peer ${state.currentPeerId}` });
    }
    
    messages.push(
        { level: "info", message: `\n💡 Commands:` },
        { level: "info", message: `   new [port]     - Create a new peer (optionally specify HTTP port)` },
        { level: "info", message: `   use <id>       - Switch to peer by ID` },
        { level: "info", message: `   list           - List all active peers` },
        { level: "info", message: `   close <id>     - Close a specific peer` },
        { level: "info", message: `   /env           - Show environment state of current peer` },
        { level: "info", message: `   exit           - Exit and close all peers` },
        { level: "info", message: `   <code>         - Execute code on current peer` },
        { level: "info", message: `` }
    );
    
    batch_log(messages);
};

export const update_prompt = (state: PeerManagerState): void => {
    const peer = get_current_peer(state);
    if (peer) {
        state.rl.setPrompt(`peer-${peer.id}(${peer.httpPort})> `);
    } else {
        state.rl.setPrompt("peer-manager> ");
    }
};

export const handle_new_command = async (
    state: PeerManagerState,
    parts: string[]
): Promise<void> => {
    const peerId = state.peers.length + 1;
    const lastPeer = state.peers[state.peers.length - 1];
    let defaultHttpPort = lastPeer 
        ? lastPeer.httpPort + 1 
        : DEFAULT_HTTP_PORT;
    
    // Check if port was provided as argument
    if (parts.length > 1) {
        const portArg = parseInt(parts[1], 10);
        if (!isNaN(portArg)) {
            defaultHttpPort = portArg;
        }
    }
    
    try {
        const peer = await create_peer(
            state.rl,
            peerId,
            defaultHttpPort,
            DEFAULT_MULTICAST_PORT,
            DEFAULT_HOST_PEER
        );
        state.peers.push(peer);
        state.currentPeerId = peerId;
        batch_log(create_log_messages(
            { level: "success", message: `\n✅ Peer ${peerId} created and active!` },
            { level: "info", message: `🎯 Switched to Peer ${peerId}` }
        ));
    } catch (e) {
        logger.error(`❌ Failed to create peer: ${e}`);
    }
    show_menu(state);
    update_prompt(state);
    state.rl.prompt();
};

export const handle_use_command = (
    state: PeerManagerState,
    parts: string[]
): void => {
    const peerId = parseInt(parts[1], 10);
    const peer = state.peers.find(p => p.id === peerId && p.active);
    if (peer) {
        state.currentPeerId = peerId;
        logger.info(`\n🎯 Switched to Peer ${peerId}`);
    } else {
        logger.info(`❌ Peer ${peerId} not found or inactive`);
    }
    update_prompt(state);
    state.rl.prompt();
};

export const handle_close_command = (
    state: PeerManagerState,
    parts: string[]
): void => {
    const peerId = parseInt(parts[1], 10);
    const peer = state.peers.find(p => p.id === peerId && p.active);
    if (peer) {
        logger.info(`\n👋 Shutting down Peer ${peerId}...`);
        cleanup(peer.setup);
        peer.active = false;
        if (state.currentPeerId === peerId) {
            const remaining = state.peers.filter(p => p.active);
            state.currentPeerId = remaining.length > 0 ? remaining[0].id : null;
            if (state.currentPeerId !== null) {
                logger.info(`🎯 Switched to Peer ${state.currentPeerId}`);
            }
        }
    } else {
        logger.info(`❌ Peer ${peerId} not found or already closed`);
    }
    show_menu(state);
    update_prompt(state);
    state.rl.prompt();
};

export const handle_env_command = (state: PeerManagerState): void => {
    const peer = get_current_peer(state);
    if (peer) {
        batch_log(create_log_messages(
            { level: "info", message: "\n📊 Environment State:" },
            { level: "info", message: summarize_env(peer.setup.env) }
        ));
    } else {
        logger.info(`❌ No active peer selected. Use 'use <id>' to select a peer.`);
    }
    state.rl.prompt();
};

export const handle_exit_command = (state: PeerManagerState): void => {
    logger.info(`\n👋 Shutting down all peers...`);
    state.peers.forEach(peer => {
        if (peer.active) {
            cleanup(peer.setup);
        }
    });
    state.rl.close();
};

export const handle_code_execution = async (
    state: PeerManagerState,
    input: string
): Promise<void> => {
    const peer = get_current_peer(state);
    if (peer) {
        await execute_code_on_peer(peer, input);
    } else {
        logger.info(`❌ No active peer selected. Use 'new' to create a peer or 'use <id>' to select one.`);
    }
    state.rl.prompt();
};
