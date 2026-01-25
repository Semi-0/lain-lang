// Backward compatibility export
// This file is kept for backward compatibility
// New code should import from src/cli/repl instead
import { startREPL } from "./repl";

// Entry point for running the REPL from command line
if (import.meta.main) {
    startREPL().catch(console.error);
}
