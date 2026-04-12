import type { Propagator } from "ppropogator";

/**
 * Function that connects input/output cells and returns the propagator instance.
 * Typed wider than `Cell[]` where a primitive accepts optional non-cell args (e.g. trace options).
 */
export type PropagatorConstructor = (...args: any[]) => Propagator;

/**
 * One special-form primitive in the root env: lookup key, arity, and how to build its propagator.
 * Use `as` only when the stored primitive metadata name must differ from `key`.
 */
export type SpecialPrimitiveSpec = Readonly<{
    key: string;
    as?: string;
    inputs: number;
    outputs: number;
    constructor: PropagatorConstructor;
}>;
