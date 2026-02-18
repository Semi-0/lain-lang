/**
 * Standalone gRPC server entrypoint for LainViz (Compile + NetworkStream).
 * Usage: bun run ./src/cli/grpc_server.ts [port] [--debug]
 *   port: default 50052 (Connect server uses 50051 for browser clients)
 *   --debug: enable DEBUG_GRPC and DEBUG_COMPILE (trace Compile + NetworkStream)
 * Or: DEBUG_GRPC=1 DEBUG_COMPILE=1 bun run grpc-server
 * Or: bun run grpc-server:debug [port]
 */
import { empty_lexical_environment } from "../../compiler/env/env"
import { create_grpc_server_io } from "../grpc/server"

const DEFAULT_PORT = 50052

function main(): void {
  const args = process.argv.slice(2)
  const debugFlag = args.includes("--debug")
  const portArg = args.filter((a) => a !== "--debug")[0]
  if (debugFlag) {
    process.env.DEBUG_GRPC = "1"
    process.env.DEBUG_COMPILE = "1"
  }

  const port = parseInt(portArg ?? String(DEFAULT_PORT), 10)
  if (Number.isNaN(port) || port < 1 || port > 65535) {
    console.error("Usage: bun run ./src/cli/grpc_server.ts [port] [--debug]")
    process.exit(1)
  }
  const env = empty_lexical_environment("grpc-root")
  const host = process.env.GRPC_HOST ?? "127.0.0.1"
  create_grpc_server_io(port, env, () => {
    console.log(`[grpc] LainViz server listening on ${host}:${port}`)
    console.log("[grpc] Note: viz and backend use Connect (50051). For browser traffic run 'bun run connect-server'.")
    if (debugFlag) console.log("[grpc] debug tracing enabled (DEBUG_GRPC, DEBUG_COMPILE)")
  })
}

main()
