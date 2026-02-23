# Connect protocol: concepts and usage

This document explains the **core concepts** of the Connect RPC protocol and **how we use it** in the server (lain-lang) and client (lain-viz).

## What is Connect?

**Connect** is an RPC protocol that runs over HTTP/1.1 or HTTP/2. It is an alternative to gRPC that is designed to work well in browsers and with standard HTTP tooling.

- **Same schema as gRPC:** Services and messages are defined in **Protocol Buffers** (`.proto`). We use the same `lain.proto` for both gRPC (Node/port 50052) and Connect (HTTP/port 50051).
- **Different wire format:** Connect supports multiple **serializations**:
  - **Connect protocol (binary):** Default; uses protobuf binary. Content-Type: `application/connect+proto`.
  - **gRPC-Web:** Optional; compatible with gRPC-Web proxies. Content-Type: `application/grpc-web+proto`.
  - **JSON:** Optional; human-readable. Content-Type: `application/json`.
- **HTTP-first:** Each RPC is a normal HTTP request. Unary calls are one request/response; server streaming is one request with a response body that carries a stream of messages. No HTTP/2 requirement, so it works in browsers and with simple HTTP servers.

So: **one .proto, one service (LainViz), two ways to call it** — gRPC (for tests/other gRPC clients) and Connect (for the browser).

## Core concepts

### 1. Service and methods

The **service** is defined in the `.proto` file. We have:

```protobuf
service LainViz {
  rpc Compile(CompileRequest) returns (CompileResponse);           // Unary
  rpc NetworkStream(CompileRequest) returns (stream NetworkUpdate); // Server streaming (legacy)
  rpc Session(stream CardsDelta) returns (stream ServerMessage);   // Bidirectional: deltas in, heartbeat + card updates out
  rpc OpenSession(OpenSessionRequest) returns (stream ServerMessage); // Browser-compatible server stream
  rpc PushDeltas(PushDeltasRequest) returns (Empty);                 // Browser-compatible delta push
  rpc CardBuild(CardBuildRequest) returns (CardBuildResponse);       // Explicit build trigger
}
```

- **Unary:** One request message → one response message. Connect maps it to a single HTTP POST; body = request, response body = response.
- **Server streaming:** One request message → many response messages. Connect maps it to one HTTP POST; response body is a stream of length-delimited protobuf messages (or JSON lines if using JSON).
- **Session (bidi):** Client sends a stream of **CardsDelta** (slots to set/remove). Server maintains slot state, runs all **cell logic** internally (when to compile is backend-only), and sends **ServerMessage** = **Heartbeat** (connection) or **CardUpdate** (card id, slot, value). The frontend handles only card updates and heartbeat; it does not process cell updates.

### 2. Codegen

From the same `.proto`, we generate:

- **Messages** (e.g. `CompileRequest`, `CompileResponse`, `NetworkUpdate`) — in `connect_generated/lain_pb.ts` (protobuf-es).
- **Service descriptor** — in `connect_generated/lain_connect.ts`. It describes the service name, method names, and request/response types. The Connect runtime uses this to know the URL path and serialization for each RPC.

Connect uses **@bufbuild/protobuf** (and protobuf-es) for messages; our gRPC path uses ts-proto. The patch script aligns imports so both can coexist.

### 3. URL and transport

- **Server:** Registers the service on a **ConnectRouter**. The Node adapter turns that into an HTTP handler. Each RPC has a path like `/lain.viz.LainViz/Compile` (package + service + method).
- **Client:** Uses a **transport** (e.g. Connect-Web’s `createConnectTransport({ baseUrl })`) that sends HTTP requests to that base URL + path. A **promise client** (`createPromiseClient(LainViz, transport)`) exposes methods like `compile(req)` and `networkStream(req)` that perform the HTTP call and (de)serialize messages.

So the “core” idea: **proto defines the contract; Connect runs that contract over HTTP with a well-defined path and serialization.**

---

## How the server uses Connect (lain-lang)

1. **Routes:** `create_connect_routes(env)` registers the **LainViz** service on a `ConnectRouter`. For each method it provides an implementation:
   - **Compile:** Receives a Connect `CompileRequest` (with `data` map of slot name → `CardRef`; `value` is raw bytes). Decodes via `to_compile_request_data(req)` into our internal `CompileRequestData` (bytes → JSON). Then `bind_context_slots_io`, `compile_for_viz`, and returns a `CompileResponse`.
   - **NetworkStream:** Same decode from `CompileRequest`. Subscribes to cell updates; the handler is an **async generator** that yields Connect `NetworkUpdate` messages until the client aborts. (Legacy; viz can use Session instead.)
   - **Session:** Bidirectional stream. Server maintains `slotMap` (CompileRequestData). On each **CardsDelta**: decode → apply delta → diff slot-map structural/content events → apply into Card API/runtime → `bind_context_slots_io(env, next)`. Then yields **Heartbeat** and **CardUpdate(s)**.
   - **OpenSession / PushDeltas:** Browser-compatible split of session stream. OpenSession starts server stream; PushDeltas applies deltas to session state, applies diffed card events, and queues Heartbeat/CardUpdate messages.
   - **CardBuild:** Unary explicit build for one card in a session (`session_id`, `card_id`). Ensures card exists and applies session code slot if present.

2. **HTTP:** `create_connect_handler_io(env)` wraps the router with **connectNodeAdapter**, which produces a Node.js `(req, res)` handler. The CLI runs this with `http.createServer()` and CORS so the browser can POST to `/lain.viz.LainViz/Compile` and `/lain.viz.LainViz/NetworkStream`.

3. **Protocol-agnostic decode:** The server does not depend on Connect-specific types for business logic. `to_compile_request_data(request)` accepts any object with a `data` map of `{ id?, value? }` (value = `Uint8Array`). So the same decode is used by both the Connect handler and the gRPC handler; only the transport and codegen differ.

4. **Encode out:** Responses are built from our internal types and converted to Connect/protobuf messages (`CompileResponse`, `NetworkUpdate`, `ServerMessage`, `CardBuildResponse`). The adapter serializes them according to the request’s Accept/Content-Type.

So on the server: **Connect = HTTP endpoint + codegen types + same compile/stream logic as gRPC.**

---

## How the client uses Connect (lain-viz)

1. **Transport:** `create_grpc_transport(baseUrl)` uses **Connect-Web**: `createConnectTransport({ baseUrl })` and `createPromiseClient(LainViz, transport)`. All calls go to `baseUrl` (e.g. `http://127.0.0.1:50051`).

2. **Unary (Compile):** `client.compile(req)` sends one HTTP POST with a serialized `CompileRequest`. The transport waits for the response and deserializes to `CompileResponse`. The viz transport layer encodes our app’s `Record<string, CardRef>` into `CompileRequest` and decodes the response into the app’s `CompileResponse` type.

3. **Server streaming (NetworkStream):** `client.networkStream(req, { signal })` sends one HTTP POST; the response body is a stream. The client iterates with `for await (const pb of stream)` and decodes each message to our `NetworkUpdate` shape. The viz wraps this in `stream(data, onUpdate)` and uses an `AbortController` so that unsubscribe aborts the stream. (Legacy; when a Connect URL is set, the viz uses Session instead.)

4. **Session (when Connect URL is set):** The viz calls `transport.open_session(onServerMessage)`, which returns `{ sendDelta, unsubscribe }`. The pipeline feeds **CardsDelta** (from `contextualized_cards_to_cards_delta$`) into `sendDelta`. Each **ServerMessage** (Heartbeat or CardUpdate) is decoded and dispatched: Heartbeat → connection state, CardUpdate → reducer (card = immutable; set = overwrite, clear = remove). The frontend does not handle cell updates; all cell logic is in the backend.

5. **Encode/decode:** The client encodes request data (slot map with JSON values) into protobuf `CompileRequest` or **CardsDelta** (slots + remove). It decodes `CompileResponse`, `NetworkUpdate`, and **ServerMessage** (Heartbeat, CardUpdate) from protobuf into the types the UI expects. So the **protocol boundary** is at the transport; the rest of the app sees domain types, not raw Connect messages.

So on the client: **Connect = fetch-based transport + promise client + encode/decode at the boundary.**

---

## Summary

| Layer        | Server (lain-lang)                          | Client (lain-viz)                              |
|-------------|----------------------------------------------|------------------------------------------------|
| Protocol    | Connect over HTTP (router + Node adapter)    | Connect-Web (fetch + promise client)            |
| Codegen     | `connect_generated/` (messages + service)    | Same service descriptor + messages (from viz)  |
| Request     | CompileRequest or **CardsDelta** → decode    | App data → encode → CompileRequest / **CardsDelta** |
| Response    | CompileResponse, NetworkUpdate, **ServerMessage** (Heartbeat, CardUpdate) | Decode → app types; frontend only card updates + heartbeat |
| Business    | apply_cards_delta_to_slot_map + slot-map->Card API sync | Transport: compile, stream, open_session, push_deltas, card_build |

The **core concept** is: one proto service, exposed over HTTP by Connect on the server and called over HTTP by Connect-Web on the client, with encode/decode at the boundary so the rest of the stack stays protocol-agnostic.

## Card lifecycle behavior (current)

- Card creation has two triggers:
  - **Explicit:** frontend calls `CardBuild`.
  - **Implicit on topology:** when `PushDeltas` introduces a new `card_connect`, backend ensures both endpoint cards exist before connecting.
- `PushDeltas` does **not** emit a separate `card_build` event from slot diff.
- Code-only updates (without `::this` change) do not update runtime card values.
- `::this` value deltas are mapped to internal `card_update` events:
  - emitted only when value signature changes from previous slot map,
  - applied only if runtime card exists; otherwise skipped and traced as `missing_card_for_update_card`.
- Reciprocal neighbor declarations are canonicalized to one logical connection event to avoid mirrored duplicate connects.

## Runtime output observer behavior (current)

- Backend runtime outputs (`::this`) are routed through an internal MiniReactor bridge pipeline.
- Part A (`openSession`) forwards runtime `::this` events to frontend as `CardUpdate`.
- Forwarding has loop guards:
  - skip when runtime value equals current session slot value (`skip_equal_state`),
  - skip when runtime value equals last forwarded outbox value (`skip_equal_outbox`).
- This avoids frontend→backend→frontend echo loops without changing protobuf schema.

---

## CardsDelta slot schema (frontend → backend)

The frontend sends **CardsDelta** with slot keys of the form `"${cardId}${slot}"`. Slots and values are produced by `sense_neighbors` and `cards_to_backend_payload` in lain-viz (`collect_data_slots.ts`).

| Slot     | When sent        | CardRef.id   | CardRef.value                |
|----------|------------------|--------------|------------------------------|
| `code`   | Always (per card)| Card id      | `card.code`                  |
| `::this` | Always (per card)| Card id      | `strongestValue ?? code`     |
| `::above`| Neighbor above   | Neighbor id  | Neighbor `code`              |
| `::below`| Neighbor below   | Neighbor id  | Neighbor `strongestValue ?? code` |
| `::left` | Neighbor left    | Neighbor id  | Neighbor `code`              |
| `::right`| Neighbor right   | Neighbor id  | Neighbor `strongestValue ?? code` |

- **Directional slots** (`::above`, `::below`, `::left`, `::right`) are sent only when a neighbor is detected in that direction (rectangle overlap).
- **Key format:** `"c1code"`, `"c1::this"`, `"c1::above"`, etc.
- **CardRef:** `{ id: string, value: unknown }`; `value` is JSON-serialized in proto `CardRef.value` (bytes).

---

## See also

- **Server components and CLI:** [CONNECT-SERVER.md](./CONNECT-SERVER.md)
- **Client transport and config:** lain-viz repo — `docs/CONNECT-TRANSPORT.md`
- **Connect spec:** [connectrpc.com](https://connectrpc.com) — protocol specification and references.
