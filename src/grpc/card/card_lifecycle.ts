/**
 * Metadata-backed card lifecycle: add_card, remove_card, connect_cards, detach_cards.
 * Re-exported from `card_api.ts` as the public API.
 */
import { Either } from "effect";
import { LexicalEnvironment } from "../../../compiler/env/env.js";
import {
    card_metadata_build,
    card_metadata_connect,
    card_metadata_detach,
    card_metadata_remove,
    card_metadata_update,
    construct_card_metadata,
    guarantee_get_card_metadata,
} from "./card_metadata.js";

export const add_card = (id: string): string => {
    console.log("add_card", id);
    construct_card_metadata(id);
    return id;
};

export const build_card = (env: LexicalEnvironment) => (id: string): string => {
    console.log("build_card", id);
    const metadata = guarantee_get_card_metadata(id);
    card_metadata_build(env, metadata);
    return id;
};

export const update_card = (id: string, value: unknown): { updated: boolean } => {
    console.log("update_card", id, value);
    const metadata = guarantee_get_card_metadata(id);
    const { updated } = card_metadata_update(metadata, value);
    return { updated };
};

export const remove_card = (id: string): void => {
    console.log("remove_card", id);
    const metadata = guarantee_get_card_metadata(id);
    card_metadata_remove(metadata);
};

export const connect_cards = (
    idA: string,
    idB: string,
    connector_keyA: string,
    connector_keyB: string
): Either.Either<void, string> => {
    console.log("connect_cards", idA, idB, connector_keyA, connector_keyB);
    const metadataA = guarantee_get_card_metadata(idA);
    const metadataB = guarantee_get_card_metadata(idB);
    card_metadata_connect(metadataA, metadataB, connector_keyA, connector_keyB);
    return Either.right(undefined as void);
};

export const detach_cards_by_key = (
    cardA_key: string,
    cardB_key: string
): Either.Either<void, string> => {
    console.log("detach_cards_by_key", cardA_key, cardB_key);
    const metadataA = guarantee_get_card_metadata(cardA_key);
    const metadataB = guarantee_get_card_metadata(cardB_key);
    card_metadata_detach(metadataA, metadataB);
    return Either.right(undefined as void);
};

export const detach_cards = (idA: string, idB: string): Either.Either<void, string> =>
    detach_cards_by_key(idA, idB);
