/**
 * Gun.js instance configuration
 * Independent version for lain-lang package
 */

import http from "http";
import type { IGunInstance } from "gun";
import Gun from "gun";
import "gun/lib/multicast.js";

export interface GunConfigOptions {
    server?: http.Server;
    radisk?: boolean;
    multicastPort?: number;
    peers?: string[];
}

/**
 * Creates a Gun.js instance with proper configuration.
 */
export const create_gun_instance = (options: GunConfigOptions = {}): IGunInstance => {
    const config: any = {
        radisk: options.radisk ?? false,
        localStorage: false,
    };

    if (options.server) {
        config.web = options.server;
    }

    if (options.multicastPort) {
        config.multicast = {
            port: options.multicastPort,
        };
    }

    if (options.peers && options.peers.length > 0) {
        config.peers = options.peers;
    }

    return Gun(config);
};
