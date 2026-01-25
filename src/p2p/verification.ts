/**
 * Environment verification utilities
 * Independent version for lain-lang package
 */

import { cell_strongest_base_value } from "ppropogator/Cell/Cell";
import type { LexicalEnvironment } from "../../compiler/env";
import { get_primitive_keys } from "../../compiler/primitive/stdlib";

/**
 * System keys that are not user-defined (primitives + special keys)
 */
const SYSTEM_KEYS = [...get_primitive_keys(), "parent"] as const;

export interface EnvironmentVerification {
    totalBindings: number;
    primitiveOperators: number;
    userDefined: number;
    userKeys: string[];
}

/**
 * Verifies and analyzes the environment state.
 * Returns statistics about bindings in the environment.
 */
export const verify_environment = (env: LexicalEnvironment): EnvironmentVerification => {
    const envMap = cell_strongest_base_value(env) as Map<string, any>;
    
    if (!envMap || !(envMap instanceof Map)) {
        return {
            totalBindings: 0,
            primitiveOperators: 0,
            userDefined: 0,
            userKeys: [],
        };
    }

    const primitiveKeys = get_primitive_keys();
    const userKeys = Array.from(envMap.keys()).filter(k => !SYSTEM_KEYS.includes(k));
    const primitiveOperators = primitiveKeys.filter(k => envMap.has(k)).length;

    return {
        totalBindings: envMap.size,
        primitiveOperators,
        userDefined: userKeys.length,
        userKeys,
    };
};

/**
 * Logs environment verification results.
 */
export const log_environment_verification = (verification: EnvironmentVerification): void => {
    console.log(`\n🔍 Initial Environment Verification:`);
    console.log(`   - Total bindings: ${verification.totalBindings}`);
    console.log(`   - Primitive operators: ${verification.primitiveOperators}`);
    console.log(`   - User-defined: ${verification.userDefined}`);
    
    if (verification.userKeys.length > 0) {
        console.log(`   - User bindings: ${verification.userKeys.join(", ")}`);
    } else {
        console.log(`   ✅ Environment is clean - only primitive operators present`);
    }
};
