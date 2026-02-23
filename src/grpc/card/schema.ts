/**
 * Card schema: slot definitions, internal cell structure, build_card, connector constructor.
 * Internal module – prefer importing from card_api or card/index.
 */
import { Cell, cell_strongest_base_value, compound_propagator, construct_cell, register_predicate } from "ppropogator";
import { c_dict_accessor, ce_dict, ce_dict_accessor, p_construct_dict_carrier } from "ppropogator/DataTypes/CarriedCell";
import { bi_sync, p_sync } from "ppropogator/Propagator/BuiltInProps";
import { define, extend_env, is_parent_key, LexicalEnvironment } from "../../../compiler/env";
import { selective_sync } from "ppropogator/DataTypes/CarriedCell/HigherOrder";
import { raw_compile } from "../../../compiler/compiler_entry";
import { predicate_not } from "generic-handler/built_in_generics/generic_combinator";
import { compose } from "generic-handler/built_in_generics/generic_combinator";
import { log_tracer } from "generic-handler/built_in_generics/generic_debugger";
import { lain_string } from "../../../compiler/lain_element";
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
    // @ts-ignore
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

export const get_key = (x: {key: string, value: Cell<unknown>}) => x.key;

export const key_is_non_local = (x: {key: string, value: Cell<unknown>}) => {
    const key = get_key(x);
    return !is_native_slot(key) && !is_parent_key(key);
}

export const extends_local_environment = (
    env: LexicalEnvironment,
    pairs: [string, Cell<unknown>][]
) => {
    const local_env = extend_env(env, pairs);
    selective_sync(key_is_non_local, local_env, env);
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
            console.log("code", code);
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
            console.log("unfolding card internal network");
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



 export const card_connector_constructor_cell =
    (connect_key_B: Cell<unknown>, connect_key_A: Cell<unknown>) =>
    (cardAthis: Cell<unknown>, cardBthis: Cell<unknown>) =>
        compound_propagator(
            [],
            [cardAthis, cardBthis],
            () => {
                const cardA_connector = connect_key_A;
                const cardB_connector = connect_key_B;
                bi_sync(cardA_connector, cardBthis);
                bi_sync(cardB_connector, cardAthis);
            },
            `card_connector_${connect_key_A}_${connect_key_B}`
        );


export const card_connector_constructor =
    (connect_key_B: string, connect_key_A: string) =>
    (cardA: Cell<unknown>, cardB: Cell<unknown>) =>
        compound_propagator(
            [],
            [cardA, cardB],
            () => {
                const cardA_connector = ce_dict_accessor(connect_key_A)(cardA);
                const cardA_this = internal_cell_this(cardA);
                const cardB_this = internal_cell_this(cardB);
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

export const internal_build_card = (env: LexicalEnvironment) => (id: string) => {
    const card = construct_cell("card", id) as Cell<unknown>;
    p_construct_card_cell(card);
    unfold_card_internal_network(card, env);
    return card;
};
