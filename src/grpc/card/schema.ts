/**
 * Card schema: slot definitions, internal cell structure, build_card, connector constructor.
 * Internal module – prefer importing from card_api or card/index.
 */
import { Cell, cell_strongest_base_value, compound_propagator, construct_cell, register_predicate } from "ppropogator";
import { c_dict_accessor, ce_dict, ce_dict_accessor, p_construct_dict_carrier } from "ppropogator/DataTypes/CarriedCell";
import { bi_sync, p_sync } from "ppropogator/Propagator/BuiltInProps";
import { LexicalEnvironment } from "../../../compiler/env";
import { selective_sync } from "ppropogator/DataTypes/CarriedCell/HigherOrder";
import { raw_compile } from "../../../compiler/compiler_entry";

export interface CardDescription {
    id: string;
    content: string;
}

export const construct_card_description = (id: string, content: string): CardDescription => ({
    id,
    content,
});

export const is_card_description = register_predicate(
    "is_card_description",
    (value: unknown): value is CardDescription =>
        typeof value === "object" && value !== null && "id" in value && "content" in value
);

export const slot_left = "::left";
export const slot_right = "::right";
export const slot_above = "::above";
export const slot_below = "::below";
export const slot_this = "::this";

export const all_slots = [
    slot_this,
    slot_left,
    slot_right,
    slot_above,
    slot_below,
] as const;

export const is_native_slot = register_predicate(
    "is_native_slot",
    (value: unknown): value is string => typeof value === "string" && all_slots.includes(value)
);

export const p_construct_card_cell = (output: Cell<unknown>) =>
    p_construct_dict_carrier(
        new Map(all_slots.map(key => [key, construct_cell(key)])),
        output
    );

export const internal_cell_getter = (key: string) => ce_dict_accessor(key);
export const internal_cell_this = internal_cell_getter(slot_this);
export const internal_cell_left = internal_cell_getter(slot_left);
export const internal_cell_right = internal_cell_getter(slot_right);
export const internal_cell_above = internal_cell_getter(slot_above);
export const internal_cell_below = internal_cell_getter(slot_below);

export const p_extends_local_environment = (
    env: LexicalEnvironment,
    pairs: [string, Cell<unknown>][],
    local_env: LexicalEnvironment
) => {
    p_sync(env, local_env);
    selective_sync(is_native_slot, local_env, env);
    pairs.forEach(([key, value]) => {
        c_dict_accessor(key)(local_env, value);
    });
};

export const extends_local_environment = (
    env: LexicalEnvironment,
    pairs: [string, Cell<unknown>][]
) => {
    const local_env = construct_cell("local_env") as LexicalEnvironment;
    p_extends_local_environment(env, pairs, local_env);
    return local_env;
};

export const compile_card_internal_code = (
    card_slot_this: Cell<unknown>,
    local_env: LexicalEnvironment
) =>
    compound_propagator(
        [card_slot_this, local_env],
        [],
        () => {
            const code = cell_strongest_base_value(card_slot_this) as string;
            raw_compile(code, local_env);
        },
        "compile_card_internal_code"
    );

export const unfold_card_internal_network = (
    card: Cell<unknown>,
    env: LexicalEnvironment
) =>
    compound_propagator(
        [card],
        [],
        () => {
            const this_cell = internal_cell_this(card);
            const left_cell = internal_cell_left(card);
            const right_cell = internal_cell_right(card);
            const above_cell = internal_cell_above(card);
            const below_cell = internal_cell_below(card);
            const local_env = extends_local_environment(env, [
                [slot_this, this_cell],
                [slot_left, left_cell],
                [slot_right, right_cell],
                [slot_above, above_cell],
                [slot_below, below_cell],
            ]);
            compile_card_internal_code(this_cell, local_env);
        },
        "unfold_card_internal_network"
    );

export const card_connector_constructor =
    (connect_key_B: string, connect_key_A: string) =>
    (cardA: Cell<unknown>, cardB: Cell<unknown>) =>
        compound_propagator(
            [],
            [cardA, cardB],
            () => {
                const cardA_connector = ce_dict_accessor(connect_key_A)(cardA);
                const cardA_this = ce_dict_accessor("::this")(cardA);
                const cardB_this = ce_dict_accessor("::this")(cardB);
                const cardB_connector = ce_dict_accessor(connect_key_B)(cardB);
                bi_sync(cardA_connector, cardB_this);
                bi_sync(cardB_connector, cardA_this);
            },
            `card_connector_${connect_key_A}_${connect_key_B}`
        );

export const card_connector_left_right = card_connector_constructor("::left", "::right");
export const card_connector_right_left = card_connector_constructor("::right", "::left");
export const card_connector_above_below = card_connector_constructor("::above", "::below");
export const card_connector_below_above = card_connector_constructor("::below", "::above");

export const build_card = (env: LexicalEnvironment) => (id: string) => {
    const card = construct_cell("card", id) as Cell<unknown>;
    p_construct_card_cell(card);
    unfold_card_internal_network(card, env);
    return card;
};
