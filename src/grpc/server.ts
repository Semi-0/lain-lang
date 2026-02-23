/**
 * gRPC server for LainViz service. create_grpc_server_io(port, env) creates and binds the server.
 */
import * as grpc from "@grpc/grpc-js"
import { LainVizService } from "./generated/lain"
import type { LexicalEnvironment } from "../../compiler/env/env"
import { handle_compile_io } from "./handlers/compile_handler.js"
import { handle_network_stream_io } from "./handlers/network_stream_handler.js"
import { build_card } from "./card/card_api.js"

export function create_grpc_server_io(
  port: number,
  env: LexicalEnvironment,
  onReady?: (err?: Error) => void
): grpc.Server {
  const server = new grpc.Server()
  server.addService(LainVizService, {
    compile: (call, callback) => handle_compile_io(call, callback, env),
    networkStream: (call) => handle_network_stream_io(call, env),
    cardBuild: (call, callback) => {
      const cardId = call.request.cardId ?? ""
      if (cardId.length === 0) {
        callback(null, { success: false, errorMessage: "card_id is required" })
        return
      }
      build_card(env)(cardId)
      callback(null, { success: true, errorMessage: "" })
    },
  })
  const host = process.env.GRPC_HOST ?? "127.0.0.1"
  server.bindAsync(
    `${host}:${port}`,
    grpc.ServerCredentials.createInsecure(),
    (err, _port) => {
      if (err != null) {
        console.error("[grpc] bind failed", err.message ?? err)
        if (String(err).includes("EADDRINUSE") || String(err).includes("address already in use")) {
          console.error("[grpc] Port may be in use. Try another port or stop the process using it.")
        }
        onReady?.(err)
        process.exit(1)
      } else {
        onReady?.()
      }
    }
  )
  return server
}
