/**
 * Card module: unified API for build, add, remove, connect (attach), detach.
 */
export * from "./card_api.js";
export type { CardDescription } from "./schema.js";
export { construct_card_description, is_card_description } from "./schema.js";
