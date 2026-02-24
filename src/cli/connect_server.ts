/**
 * Standalone Connect server entrypoint for LainViz (Compile + NetworkStream).
 * Usage: bun run ./src/cli/connect_server.ts [port] [--debug]
 *   port: default 50051 (browser/frontend default)
 *   --debug: enable DEBUG_GRPC and DEBUG_COMPILE
 * Or: bun run connect-server | connect-server:debug
 */
import * as http from "node:http"
import type { IncomingMessage, ServerResponse } from "node:http"
import { empty_lexical_environment } from "../../compiler/env/env"
import { init_system } from "../../compiler/incremental_compiler"
import { create_connect_handler_io } from "../grpc/connect_server"
import { primitive_env } from "../../compiler/closure"

const DEFAULT_PORT = 50051

/** CORS headers so browser at localhost:5173 can call this server. See connectrpc.com/docs/cors */
function setCorsHeaders(res: ServerResponse, req: IncomingMessage): void {
  const origin = req.headers.origin ?? "http://localhost:5173"
  res.setHeader("Access-Control-Allow-Origin", origin)
  res.setHeader("Access-Control-Allow-Methods", "POST, GET")
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Content-Type, Connect-Protocol-Version, Connect-Timeout-Ms, Grpc-Timeout, X-Grpc-Web, X-User-Agent"
  )
  res.setHeader("Access-Control-Expose-Headers", "Grpc-Status, Grpc-Message, Grpc-Status-Details-Bin")
  res.setHeader("Access-Control-Max-Age", "7200")
  res.setHeader("Vary", "Origin, Access-Control-Request-Method, Access-Control-Request-Headers")
}

function withCors(handler: (req: IncomingMessage, res: ServerResponse) => void): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    setCorsHeaders(res, req)
    if (req.method === "OPTIONS") {
      res.writeHead(204)
      res.end()
      return
    }
    handler(req, res)
  }
}

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
    console.error("Usage: bun run ./src/cli/connect_server.ts [port] [--debug]")
    process.exit(1)
  }
  init_system()
  const env = primitive_env() 
  const connectHandler = create_connect_handler_io(env)
  const handler = withCors(connectHandler)
  const server = http.createServer(handler)
  server.listen(port, () => {
    const host = process.env.GRPC_HOST ?? "127.0.0.1"
    console.log(`[connect] LainViz server listening on http://${host}:${port}`)
    console.log("[connect] Open viz at http://localhost:5173 — request logs appear here.")
    if (debugFlag) console.log("[connect] debug tracing enabled (DEBUG_GRPC, DEBUG_COMPILE)")
  })
}

main()
