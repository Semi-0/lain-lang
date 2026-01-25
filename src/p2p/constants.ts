/**
 * Constants for P2P setup and synchronization
 * Independent version for lain-lang package
 */

// Timing constants (in milliseconds)
export const TIMING = {
    /** Delay before calling sync_runtime_to_gun after init_sync_env */
    SYNC_INIT_DELAY: 1000,
    /** Additional wait time after sync initialization to ensure sync completes */
    SYNC_WAIT_DELAY: 1500,
    /** Wait time for peer to receive data from host */
    PEER_SYNC_WAIT: 3000,
    /** Interval for executing tasks (propagator execution) */
    EXECUTION_INTERVAL: 1000,
} as const;

// Network constants
export const NETWORK = {
    /** Default multicast address */
    MULTICAST_ADDRESS: "233.255.255.255",
    /** Default multicast port */
    DEFAULT_MULTICAST_PORT: 8765,
    /** Default HTTP port for host */
    DEFAULT_HTTP_PORT_HOST: 8765,
    /** Default HTTP port for peer */
    DEFAULT_HTTP_PORT_PEER: 8766,
} as const;

// Environment constants
export const ENV = {
    /** Default environment ID */
    DEFAULT_ENV_ID: "lain-env-id",
} as const;
