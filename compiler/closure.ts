export * from "./closure/base"
export * from "./closure/predicates"
export * from "./closure/unfold"
export * from "./closure/application"
export * from "./primitive/base"
export * from "./primitive/application"
export * from "./primitive/stdlib"

// Explicit type re-export for Vite compatibility (export * doesn't always re-export types)
export type { ClosureTemplate } from "./closure/base";
export type { Primitive } from "./primitive/base";
