/**
 * Command handlers for peer CLI
 * Independent version for lain-lang package
 */

import type { Interface } from "readline";
import { setupPeer, type PeerSetup } from "../p2p/setup";
import { verify_environment, log_environment_verification } from "../p2p/verification";
import { ENV, NETWORK } from "../p2p/constants";
import { logger, batch_log, create_log_messages } from "./logger";
import { execute_code } from "./repl_handlers";
import { execute_all_tasks_sequential } from "ppropogator";
import { source_cell } from "ppropogator/DataTypes/PremisesSource";

const ENV_ID = ENV.DEFAULT_ENV_ID;
const DEFAULT_MULTICAST_PORT = NETWORK.DEFAULT_MULTICAST_PORT;
const DEFAULT_HTTP_PORT = NETWORK.DEFAULT_HTTP_PORT_PEER;
const DEFAULT_HOST_PEER = `http://localhost:${NETWORK.DEFAULT_HTTP_PORT_HOST}/gun`;

export interface PeerInstance {
    id: number;
    httpPort: number;
    multicastPort: number;
    hostPeer: string;
    setup: PeerSetup;
    active: boolean;
}

const prompt_question = (rl: Interface, question: string): Promise<string> => {
    return new Promise((resolve) => {
        rl.question(question, (answer) => {
            resolve(answer.trim());
        });
    });
};

const prompt_number = async (rl: Interface, question: string, defaultValue: number): Promise<number> => {
    const answer = await prompt_question(rl, question);
    if (!answer) return defaultValue;
    const num = parseInt(answer, 10);
    return isNaN(num) ? defaultValue : num;
};

const verify_peer_environment = (env: any) => {
    const verification = verify_environment(env);
    if (verification.totalBindings > 0) {
        log_environment_verification(verification);
    } else {
        logger.warn(`   ⚠️  Environment not yet synced, this is expected on first connection`);
    }
};

const source = source_cell("peer");

// TODO: more explicit source cell usage!!!
export const execute_code_on_peer = async (peer: PeerInstance, code: string): Promise<void> => {
    const { env } = peer.setup;
    await execute_all_tasks_sequential(console.error);
    await execute_code(code, env, source);
};

export const create_peer = async (
    rl: Interface,
    peerId: number,
    defaultHttpPort: number = DEFAULT_HTTP_PORT + peerId - 1,
    defaultMulticastPort: number = DEFAULT_MULTICAST_PORT,
    defaultHostPeer: string = DEFAULT_HOST_PEER
): Promise<PeerInstance> => {
    batch_log(create_log_messages(
        { level: "info", message: `\n📡 Configuring Peer ${peerId}:` }
    ));
    
    const httpPort = await prompt_number(
        rl,
        `   HTTP Port [${defaultHttpPort}]: `,
        defaultHttpPort
    );
    
    const multicastPort = await prompt_number(
        rl,
        `   Multicast Port [${defaultMulticastPort}]: `,
        defaultMulticastPort
    );
    
    const hostPeerAnswer = await prompt_question(
        rl,
        `   Host Peer URL [${defaultHostPeer}]: `
    );
    const hostPeer = hostPeerAnswer || defaultHostPeer;

    logger.info(`\n🚀 Initializing Peer ${peerId} on port ${httpPort}...`);

    const setup = await setupPeer({
        httpPort,
        multicastPort,
        hostPeer,
        envId: ENV_ID,
        enableTrace: true,
    });

    const { env } = setup;
    verify_peer_environment(env);

    logger.info(`\n🎯 Peer ${peerId} connected to shared environment!`);

    const peer: PeerInstance = {
        id: peerId,
        httpPort,
        multicastPort,
        hostPeer,
        setup,
        active: true,
    };

    return peer;
};
