/**
 * Shared utilities for P2P setup
 * Independent version for lain-lang package
 */

import type { IGunInstance } from "gun";
import { init_system } from "../../compiler/incremental_compiler";
import { set_immediate_execute, execute_all_tasks_sequential } from "ppropogator";
import { sync_runtime_to_gun } from "../../compiler/sync_to_gun";

const SYNC_INIT_DELAY = 100; // ms
const PEER_SYNC_TIMEOUT = 5000; // ms
const EXECUTION_INTERVAL = 100; // ms

/**
 * Initializes the sync environment with Gun.
 * Schedules sync_runtime_to_gun() to be called after SYNC_INIT_DELAY.
 */
export const init_sync_env = (gun: IGunInstance): void => {
    init_system();
    setTimeout(() => {
        set_immediate_execute(true);
        sync_runtime_to_gun(gun);
    }, SYNC_INIT_DELAY);
};

/**
 * Waits for sync_runtime_to_gun() to be called and complete.
 * This ensures the environment is actually synced to Gun.
 */
export const wait_for_sync_init = async (): Promise<void> => {
    await new Promise(resolve => setTimeout(resolve, SYNC_INIT_DELAY + 50));
};

/**
 * Waits for peer to sync environment from host.
 */
export const wait_for_peer_sync = async (): Promise<void> => {
    await new Promise(resolve => setTimeout(resolve, PEER_SYNC_TIMEOUT));
};

/**
 * Creates an execution interval for running tasks periodically.
 */
export const create_execution_interval = (): NodeJS.Timeout => {
    return setInterval(async () => {
        await execute_all_tasks_sequential(() => {});
    }, EXECUTION_INTERVAL);
};
