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
    construct_card_metadata(id);
    return id;
};

export const build_card = (env: LexicalEnvironment) => (id: string): string => {
    const metadata = guarantee_get_card_metadata(id);
    card_metadata_build(env, metadata);
    return id;
};

export const update_card = (id: string, value: unknown): { updated: boolean } => {
    const metadata = guarantee_get_card_metadata(id);
    const { updated } = card_metadata_update(metadata, value);
    return { updated };
};

export const remove_card = (id: string): void => {
    const metadata = guarantee_get_card_metadata(id);
    card_metadata_remove(metadata);
};

export const connect_cards = (
    idA: string,
    idB: string,
    connector_keyA: string,
    connector_keyB: string
): Either.Either<void, string> => {
    const metadataA = guarantee_get_card_metadata(idA);
    const metadataB = guarantee_get_card_metadata(idB);
    card_metadata_connect(metadataA, metadataB, connector_keyA, connector_keyB);
    return Either.right(undefined as void);
};

export const detach_cards_by_key = (
    cardA_key: string,
    cardB_key: string
): Either.Either<void, string> => {
    const metadataA = guarantee_get_card_metadata(cardA_key);
    const metadataB = guarantee_get_card_metadata(cardB_key);
    card_metadata_detach(metadataA, metadataB);
    return Either.right(undefined as void);
};

export const detach_cards = (idA: string, idB: string): Either.Either<void, string> =>
    detach_cards_by_key(idA, idB);
