/**
 * After buf generate: patch ts-proto generated code to use protobuf-wire (2.x) for
 * BinaryReader/BinaryWriter so the rest of the project can use @bufbuild/protobuf 1.x (Connect).
 */
import * as fs from "node:fs"
import * as path from "node:path"

const generatedLain = path.join(import.meta.dir, "..", "src", "grpc", "generated", "lain.ts")
if (fs.existsSync(generatedLain)) {
  let s = fs.readFileSync(generatedLain, "utf8")
  s = s.replace(/@bufbuild\/protobuf\/wire/g, "protobuf-wire/wire")
  fs.writeFileSync(generatedLain, s)
}
