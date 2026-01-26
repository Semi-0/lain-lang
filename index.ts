/**
 * Main entry point for lain-lang
 * 
 * This package provides:
 * - Compiler: Core compiler functionality
 * - DB: Database and serialization
 * - CLI: Command-line interfaces for host, peer, and REPL
 * - P2P: Peer-to-peer synchronization setup
 */

// Core module exports
export * from "./compiler";
export * from "./DB";
export * from "./src/p2p/setup";

// ============================================================================
// MAIN CLI ENTRY POINTS - Primary entry points for the project
// ============================================================================
// These are the main entry points that users should use:
// - lain-host: Start a host server (./src/cli/host.ts)
// - lain-peer: Start a peer client (./src/cli/peer.ts)
// - lain-repl: Start a REPL (./src/cli/repl.ts)
// ============================================================================

export { start_server } from "./src/cli/host";
export { run_client } from "./src/cli/peer";
export { startREPL } from "./compiler/repl";

// Re-export CLI modules for programmatic access
export * from "./src/cli/host";
export * from "./src/cli/peer";
export * from "./src/cli/repl";
