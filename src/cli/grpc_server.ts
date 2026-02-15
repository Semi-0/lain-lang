/**
 * Standalone gRPC server entrypoint for LainViz (Compile + NetworkStream).
 * Usage: bun run ./src/cli/grpc_server.ts [port]
 * Default port: 50051
 */
import { empty_lexical_environment } from "../../compiler/env/env"
import { create_grpc_server_io } from "../grpc/server"

const DEFAULT_PORT = 50051

function main(): void {
  const port = parseInt(process.argv[2] ?? String(DEFAULT_PORT), 10)
  if (Number.isNaN(port) || port < 1 || port > 65535) {
    console.error("Usage: bun run ./src/cli/grpc_server.ts [port]")
    process.exit(1)
  }
  const env = empty_lexical_environment("grpc-root")
  create_grpc_server_io(port, env)
  console.log(`[grpc] LainViz server listening on 0.0.0.0:${port}`)
}

main()
