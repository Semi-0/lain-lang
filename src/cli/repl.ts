import { startREPL } from "../../compiler/repl";

/**
 * Entry point for running the REPL from command line
 * 
 * Usage: `bun run lain-repl`
 */
if (import.meta.main) {
    startREPL().catch(console.error);
}
