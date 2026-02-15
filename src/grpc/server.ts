/**
 * gRPC server for LainViz service. create_grpc_server_io(port, env) creates and binds the server.
 */
import * as grpc from "@grpc/grpc-js"
import { LainVizService } from "./generated/lain"
import type { LexicalEnvironment } from "../../compiler/env/env"
import { handle_compile_io } from "./compile_handler"
import { handle_network_stream_io } from "./network_stream_handler"

export function create_grpc_server_io(
  port: number,
  env: LexicalEnvironment
): grpc.Server {
  const server = new grpc.Server()
  server.addService(LainVizService, {
    compile: (call, callback) => handle_compile_io(call, callback, env),
    networkStream: (call) => handle_network_stream_io(call, env),
  })
  server.bindAsync(
    `0.0.0.0:${port}`,
    grpc.ServerCredentials.createInsecure(),
    (err, _port) => {
      if (err != null) {
        console.error("[grpc] bind failed", err)
        return
      }
    }
  )
  return server
}
