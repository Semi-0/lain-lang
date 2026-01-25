/**
 * P2P setup functions for host and peer
 * Independent version for lain-lang package
 */

import http from "http";
import type { IGunInstance } from "gun";
import { construct_cell, execute_all_tasks_sequential } from "ppropogator";
import { primitive_env } from "../../compiler/closure";
import { gun_cell_receiver } from "../../DB/serialize/gun_cell";
import type { LexicalEnvironment } from "../../compiler/env";
import { bi_sync } from "ppropogator/Propagator/BuiltInProps";
import { init_sync_env, wait_for_sync_init, wait_for_peer_sync, create_execution_interval } from "./utils";
import { create_gun_instance } from "./gun_config";

export interface HostConfig {
    httpPort: number;
    multicastPort: number;
    envId: string;
    radisk?: boolean;
    enableTrace?: boolean;
}

export interface PeerConfig {
    httpPort: number;
    multicastPort: number;
    hostPeer: string;
    envId: string;
    radisk?: boolean;
    enableTrace?: boolean;
}

export interface HostSetup {
    server: http.Server;
    gun: IGunInstance;
    env: LexicalEnvironment;
    executionInterval: NodeJS.Timeout;
}

export interface PeerSetup {
    server: http.Server;
    gun: IGunInstance;
    env: LexicalEnvironment;
    executionInterval: NodeJS.Timeout;
}

export const setupHost = async (config: HostConfig): Promise<HostSetup> => {
    if (config.enableTrace) {
        console.log(`🚀 Initializing Host on port ${config.httpPort}...`);
    }
    
    const server = http.createServer().listen(config.httpPort);
    const gun = create_gun_instance({
        server,
        radisk: config.radisk,
        multicastPort: config.multicastPort,
        peers: [],
    });

    if (config.enableTrace) {
        console.log(`🔫 Gun server listening on port ${config.httpPort}`);
        console.log(`📡 Multicast enabled on port ${config.multicastPort}`);
    }

    init_sync_env(gun);

    if (config.enableTrace) {
        console.log(`🏗️  Creating environment with ID: ${config.envId}`);
    }
    
    const env = primitive_env(config.envId) as LexicalEnvironment;
    
    if (config.enableTrace) {
        console.log(`⏳ Waiting for sync_runtime_to_gun to initialize...`);
    }
    await wait_for_sync_init();

    const executionInterval = create_execution_interval();

    if (config.enableTrace) {
        console.log(`✅ Host ready and synced to Gun`);
    }

    return { server, gun, env, executionInterval };
};

export const setupPeer = async (config: PeerConfig): Promise<PeerSetup> => {
    if (config.enableTrace) {
        console.log(`🚀 Initializing Peer on port ${config.httpPort}...`);
    }

    const server = http.createServer().listen(config.httpPort);
    const gun = create_gun_instance({
        server,
        radisk: config.radisk,
        multicastPort: config.multicastPort,
        peers: [config.hostPeer],
    });

    if (config.enableTrace) {
        console.log(`🔫 Gun peer listening on port ${config.httpPort}`);
        console.log(`🔗 Connected to host: ${config.hostPeer}`);
    }

    init_sync_env(gun);
    await wait_for_sync_init();

    if (config.enableTrace) {
        console.log(`📥 Receiving environment from host...`);
    }
    
    const env = gun_cell_receiver(gun, "env", config.envId) as LexicalEnvironment;

    if (config.enableTrace) {
        console.log(`⏳ Waiting for Gun sync from host...`);
    }
    
    await wait_for_peer_sync();

    const executionInterval = create_execution_interval();

    if (config.enableTrace) {
        console.log(`✅ Peer ready`);
    }
    
    const local_env = construct_cell("local_env");
    bi_sync(local_env, env);

    // Execute tasks to ensure bi_sync propagator runs
    await execute_all_tasks_sequential(() => {});

    return { server, gun, env: local_env as LexicalEnvironment, executionInterval };
};

export const cleanup = (setup: HostSetup | PeerSetup) => {
    clearInterval(setup.executionInterval);
    setup.server.close();
};
