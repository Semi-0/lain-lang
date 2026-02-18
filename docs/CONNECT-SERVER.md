# Connect server (lain-lang)

The backend exposes a **Connect** HTTP server on port **50051** so the browser (lain-viz) can talk to it directly over HTTP/1.1—no proxy. This document describes the added components.

## Overview

| Component | Location | Purpose |
|-----------|----------|---------|
| Connect codegen | `src/grpc/connect_generated/` | Service and message types for Connect (protobuf-es). |
| Protocol-agnostic decode | `src/grpc/decode.ts` | `to_compile_request_data()` turns any request shape into `CompileRequestData`. |
| Connect server | `src/grpc/connect_server.ts` | `create_connect_routes()`, `create_connect_handler_io()`; registers LainViz Compile + NetworkStream. |
| CLI | `src/cli/connect_server.ts` | HTTP server with CORS; default port 50051. |
| Tracer | `src/grpc/tracer.ts` | Request logging (always-on one-liner; verbose when `DEBUG_GRPC` / `DEBUG_COMPILE`). |
| Patch script | `scripts/patch-protobuf-imports.ts` | Post-codegen: ts-proto uses `protobuf-wire`, Connect uses `@bufbuild/protobuf` 1.x. |

## Ports

- **50051** — Connect server (browser / viz). Run: `bun run connect-server` or `bun run connect-server:debug`.
- **50052** — gRPC server (tests / gRPC clients). Run: `bun run grpc-server`.

The viz app is configured to use **50051** only.

## Connect codegen

- **buf.gen.yaml** runs two extra plugins into `src/grpc/connect_generated/`:
  - `protoc-gen-es` → messages (`lain_pb.ts`).
  - `protoc-gen-connect-es` → LainViz service descriptor (`lain_connect.ts`).
- After `bun run generate`, `patch-protobuf-imports.ts` rewrites `@bufbuild/protobuf/wire` to `protobuf-wire/wire` in `src/grpc/generated/lain.ts` so ts-proto (2.x wire) and Connect (1.x protobuf) coexist.

## Decode (protocol-agnostic)

- **`to_compile_request_data(request)`** in `decode.ts` accepts any `{ data?: Record<string, { id?: string; value?: Uint8Array }> }` and returns `CompileRequestData`.
- Used by both the gRPC handler (via `decode_compile_request`) and the Connect handler, so request parsing is shared and protocol-agnostic.

## Connect server implementation

- **`create_connect_routes(env)`** returns a function that registers LainViz on a `ConnectRouter`:
  - **Compile:** `to_compile_request_data(req)` → `bind_context_slots_io(env, data)` → `compile_for_viz(data)` → `CompileResponse`.
  - **NetworkStream:** async generator; `subscribe_cell_updates(data, callback)` pushes into a queue; yields Connect `NetworkUpdate` (same shape as encode layer).
- **`create_connect_handler_io(env)`** returns the result of `connectNodeAdapter({ routes: create_connect_routes(env) })` for use with `http.createServer()`.

## CLI and CORS

- **`src/cli/connect_server.ts`** creates an HTTP server with:
  - **CORS:** `withCors()` sets `Access-Control-Allow-Origin` (from request or `http://localhost:5173`), allows `POST, GET`, and Connect/gRPC-Web headers; responds to `OPTIONS` with 204 so the browser preflight succeeds.
  - Default port **50051**; optional `--debug` sets `DEBUG_GRPC` and `DEBUG_COMPILE`.

Without CORS, the browser at `http://localhost:5173` would block requests to `http://127.0.0.1:50051`.

## Request logging (tracer)

- **`trace_compile_request_io`** and **`trace_network_stream_io`** in `src/grpc/tracer.ts`:
  - Always log one line per request: `[grpc] Compile request received` / `[grpc] NetworkStream received`.
  - When `DEBUG_GRPC=1` or `DEBUG_COMPILE=1` (Compile only), also log full request/data.

## Scripts (package.json)

- `connect-server` — `bun run ./src/cli/connect_server.ts` (port 50051).
- `connect-server:debug` — same with `DEBUG_GRPC=1` and `DEBUG_COMPILE=1`.
- `generate` — `buf generate` then `bun run ./scripts/patch-protobuf-imports.ts`.

## See also

- **E2E:** lain-viz `docs/E2E-SMOKE.md` — run Connect server, then viz; no proxy.
- **Implementation plan:** lain-viz `docs/IMPLEMENTATION-PLAN.md` §4.1 — transport and Connect backend.
