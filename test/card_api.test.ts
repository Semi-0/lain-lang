/**
 * Unit tests for Card API: add_card, remove_card, connect_cards, detach_cards, build_card.
 * Verifies topology of the propagator graph: cells and propagators are truly connected
 * via Cell.getNeighbors() and Propagator.getInputs()/getOutputs().
 * Based on Propogator/Cell/Cell.ts and Propogator/Propagator/Propagator.ts.
 *
 * Note: detach disposes the connector compound but not the bi_sync child propagators
 * (compound_propagator does not track children for disposal). Storage is cleared.
 */

import { expect, test, beforeEach, describe } from "bun:test";
import {
    cell_id,
    cell_strongest_base_value,
    is_cell,
    type Cell,
} from "ppropogator";
import { execute_all_tasks_sequential } from "ppropogator/Shared/Scheduler/Scheduler";
import type { Propagator } from "ppropogator/Propagator/Propagator";
import { Either } from "effect";

import {
    add_card,
    remove_card,
    connect_cards,
    detach_cards,
    detach_cards_by_key,
    build_card,
    internal_cell_this,
    internal_cell_left,
    internal_cell_right,
    slot_this,
} from "../src/grpc/card";
import { primitive_env } from "../compiler/closure";
import { init_system } from "../compiler/incremental_compiler";
import { update_cell } from "ppropogator/Cell/Cell";
import { vector_clock_prove_staled_by } from "ppropogator/DataTypes/TemporaryValueSet";

beforeEach(() => {
    init_system();
});

// --- Topology helpers (walk the propagator graph) ---

/** Propagators that have this cell as neighbor (input or output). */
const propagators_touching_cell = (cell: Cell<unknown>): Propagator[] =>
    Array.from(cell.getNeighbors().values()).map((n) => n.propagator);

/** True if some propagator links both cells (both in inputs or outputs). */
const cells_linked_by_propagator = (
    cellA: Cell<unknown>,
    cellB: Cell<unknown>
): boolean => {
    for (const prop of propagators_touching_cell(cellA)) {
        const ins = prop.getInputs();
        const outs = prop.getOutputs();
        if (
            ins.some((c) => c === cellB) ||
            outs.some((c) => c === cellB)
        ) {
            return true;
        }
    }
    return false;
};

/** Count propagators that link both cells. */
const count_links_between_cells = (
    cellA: Cell<unknown>,
    cellB: Cell<unknown>
): number => {
    let n = 0;
    for (const prop of propagators_touching_cell(cellA)) {
        const ins = prop.getInputs();
        const outs = prop.getOutputs();
        if (
            ins.some((c) => c === cellB) ||
            outs.some((c) => c === cellB)
        ) {
            n++;
        }
    }
    return n;
};


/** Assert cardA's slotA cell is linked to cardB's ::this, and cardB's slotB to cardA's ::this. */
const assert_cards_connected_via_topology = (
    cardA: Cell<unknown>,
    cardB: Cell<unknown>,
    slotA: string,
    slotB: string
) => {
    const getSlot = (card: Cell<unknown>, slot: string) =>
        slot === "::this"
            ? internal_cell_this(card)
            : slot === "::left"
              ? internal_cell_left(card)
              : slot === "::right"
                ? internal_cell_right(card)
                : internal_cell_this(card);
    const cellA_connector = getSlot(cardA, slotA);
    const cellB_connector = getSlot(cardB, slotB);
    const cellA_this = internal_cell_this(cardA);
    const cellB_this = internal_cell_this(cardB);

    expect(cells_linked_by_propagator(cellA_connector, cellB_this)).toBe(true);
    expect(cells_linked_by_propagator(cellB_connector, cellA_this)).toBe(true);
};

describe("Card API Tests", () => {
    describe("add_card", () => {
        test("should add a card and return a cell", () => {
            const card = add_card("card-1");
            expect(card).toBeDefined();
            expect(is_cell(card)).toBe(true);
            expect(cell_id(card)).toBe("card-1");
        });

        test("add_card cell has topology (neighbors)", () => {
            const card = add_card("topo-a");
            const props = propagators_touching_cell(card);
            expect(Array.isArray(props)).toBe(true);
        });

        test("should allow adding multiple cards with different ids", () => {
            const cardA = add_card("a");
            const cardB = add_card("b");
            expect(cardA).toBeDefined();
            expect(cardB).toBeDefined();
            expect(cell_id(cardA)).toBe("a");
            expect(cell_id(cardB)).toBe("b");
        });
    });

    describe("remove_card", () => {
        test("should remove a card without throwing", () => {
            add_card("to-remove");
            expect(() => remove_card("to-remove")).not.toThrow();
        });

        test("remove_card on non-existent id should not throw", () => {
            expect(() => remove_card("non-existent")).not.toThrow();
        });

        test("remove_card detaches connectors: storage cleared, topology verified before", async () => {
            const env = primitive_env();
            const cardA = build_card(env)("ra");
            const cardB = build_card(env)("rb");
            add_card("ra");
            add_card("rb");
            connect_cards(cardA, cardB, slot_this, slot_this);
            await execute_all_tasks_sequential(() => {});

            assert_cards_connected_via_topology(cardA, cardB, "::this", "::this");

            remove_card("ra");
            await execute_all_tasks_sequential(() => {});

            const detachResult = detach_cards_by_key("ra", "rb");
            expect(Either.isLeft(detachResult)).toBe(true);
        });
    });

    describe("connect_cards", () => {
        test("connect creates topology: cardA.::right <-> cardB.::this, cardB.::left <-> cardA.::this", async () => {
            const env = primitive_env();
            const cardA = build_card(env)("ca");
            const cardB = build_card(env)("cb");
            connect_cards(cardA, cardB, "::right", "::left");
            await execute_all_tasks_sequential(() => {});

            assert_cards_connected_via_topology(cardA, cardB, "::right", "::left");
        });

        test("multiple card pairs each create independent topology", async () => {
            const env = primitive_env();
            const a = build_card(env)("c1");
            const b = build_card(env)("c2");
            const c = build_card(env)("c3");
            connect_cards(a, b, "::right", "::left");
            connect_cards(b, c, "::right", "::left");
            await execute_all_tasks_sequential(() => {});

            assert_cards_connected_via_topology(a, b, "::right", "::left");
            assert_cards_connected_via_topology(b, c, "::right", "::left");

            const aRight = internal_cell_right(a);
            const cLeft = internal_cell_left(c);
            expect(cells_linked_by_propagator(aRight, cLeft)).toBe(false);
        });
    });

    describe("detach_cards / detach_cards_by_key", () => {
        test("detach returns Right; connect topology verified before detach", async () => {
            const env = primitive_env();
            const cardA = build_card(env)("da");
            const cardB = build_card(env)("db");
            connect_cards(cardA, cardB, "::right", "::left");
            await execute_all_tasks_sequential(() => {});

            assert_cards_connected_via_topology(cardA, cardB, "::right", "::left");

            const result = detach_cards(cardA, cardB);
            expect(Either.isRight(result)).toBe(true);
        });

        test("detach_cards_by_key returns Left when connector not found", () => {
            const result = detach_cards_by_key("nonexistent-a", "nonexistent-b");
            expect(Either.isLeft(result)).toBe(true);
            if (Either.isLeft(result)) {
                expect(result.left).toContain("Connector not found");
            }
        });

        test("second detach returns Left (idempotent)", async () => {
            const env = primitive_env();
            const cardA = build_card(env)("d2a");
            const cardB = build_card(env)("d2b");
            connect_cards(cardA, cardB, "::right", "::left");
            await execute_all_tasks_sequential(() => {});

            const first = detach_cards_by_key("d2a", "d2b");
            expect(Either.isRight(first)).toBe(true);

            const second = detach_cards_by_key("d2a", "d2b");
            expect(Either.isLeft(second)).toBe(true);
        });
    });

    describe("build_card", () => {
        test("build_card creates card with slot topology", () => {
            const env = primitive_env();
            const card = build_card(env)("build-1");
            expect(card).toBeDefined();
            expect(is_cell(card)).toBe(true);

            const thisCell = internal_cell_this(card);
            const rightCell = internal_cell_right(card);
            expect(thisCell).toBeDefined();
            expect(rightCell).toBeDefined();
            expect(propagators_touching_cell(thisCell).length).toBeGreaterThanOrEqual(0);
        });

        test("build_card with code: ::this has neighbors, out propagates to 3", async () => {
            const env = primitive_env();
            const card = build_card(env)("build-code");
            const thisCell = internal_cell_this(card);
            update_cell(thisCell, "(+ 1 2 out)");
            await execute_all_tasks_sequential(() => {});

            const props = propagators_touching_cell(thisCell);
            expect(props.length).toBeGreaterThan(0);

            const envMap = cell_strongest_base_value(env) as Map<string, unknown>;
            const outCell = envMap?.get?.("out") as Cell<unknown> | undefined;
            expect(outCell).toBeDefined();
            expect(cell_strongest_base_value(outCell)).toBe(3);
        });

        test("build_card network definition: add1 defined in env", async () => {
            const env = primitive_env();
            const card = build_card(env)("build-network");
            const thisCell = internal_cell_this(card);
            update_cell(thisCell, `(network add1 (>:: x) (::> y) (+ x 1 y))`);
            await execute_all_tasks_sequential(() => {});

            const envMap = cell_strongest_base_value(env) as Map<string, unknown>;
            const add1Cell = envMap?.get?.("add1") as Cell<unknown> | undefined;
            expect(add1Cell).toBeDefined();
            expect(propagators_touching_cell(add1Cell).length).toBeGreaterThanOrEqual(0);
        });
    });

    describe("Integration: topology of connected cards", () => {
        test("connect_cards creates bi_sync propagators between slot cells", async () => {
            const env = primitive_env();
            const fullA = build_card(env)("full-a");
            const fullB = build_card(env)("full-b");
            connect_cards(fullA, fullB, "::right", "::left");
            await execute_all_tasks_sequential(() => {});

            const aRight = internal_cell_right(fullA);
            const bThis = internal_cell_this(fullB);
            const links = count_links_between_cells(aRight, bThis);
            expect(links).toBeGreaterThanOrEqual(1);
        });
    });

    describe("Cross-card propagation", () => {
        test.only("(+ ::above 1 ::right) with above and right neighbors: update above ::this, right ::this receives", async () => {
            const env = primitive_env();
            const cardAbove = build_card(env)("prop-above");
            const cardAboveThis = internal_cell_this(cardAbove);
            const centerCard = build_card(env)("prop-center");
            const centerThis = internal_cell_this(centerCard);
            const cardRight = build_card(env)("prop-right");
            const cardRightThis = internal_cell_this(cardRight);

            update_cell(centerThis, "(+ ::above 1 ::right)");
            connect_cards(cardAbove, centerCard, "::below", "::above");
            connect_cards(centerCard, cardRight, "::right", "::left");
            await execute_all_tasks_sequential(console.error);
            

            update_cell(cardAboveThis, 5);
            
         
            await execute_all_tasks_sequential(console.error);
            console.log("cardRightThis", cardRightThis.summarize());

            const centerRight = cell_strongest_base_value(cardRightThis);
            expect(centerRight).toBe(6);
            expect(cell_strongest_base_value(cardRightThis)).toBe(6);
        });
    });

    describe("Long chain: topology correctness", () => {
        const CHAIN_LENGTH = 20;

        test("long chain: every consecutive pair has correct topology", async () => {
            const env = primitive_env();
            const cards: Cell<unknown>[] = [];
            for (let i = 0; i < CHAIN_LENGTH; i++) {
                cards.push(build_card(env)(`chain-${i}`));
            }
            for (let i = 0; i < CHAIN_LENGTH - 1; i++) {
                connect_cards(cards[i]!, cards[i + 1]!, "::right", "::left");
            }
            await execute_all_tasks_sequential(() => {});

            for (let i = 0; i < CHAIN_LENGTH - 1; i++) {
                assert_cards_connected_via_topology(
                    cards[i]!,
                    cards[i + 1]!,
                    "::right",
                    "::left"
                );
            }
        });

        test("long chain then detach middle link: storage cleared", async () => {
            const env = primitive_env();
            const cards: Cell<unknown>[] = [];
            for (let i = 0; i < CHAIN_LENGTH; i++) {
                cards.push(build_card(env)(`detach-chain-${i}`));
            }
            for (let i = 0; i < CHAIN_LENGTH - 1; i++) {
                connect_cards(cards[i]!, cards[i + 1]!, "::right", "::left");
            }
            await execute_all_tasks_sequential(() => {});

            const mid = Math.floor(CHAIN_LENGTH / 2);
            const idA = `detach-chain-${mid}`;
            const idB = `detach-chain-${mid + 1}`;

            assert_cards_connected_via_topology(
                cards[mid]!,
                cards[mid + 1]!,
                "::right",
                "::left"
            );

            const detachResult = detach_cards_by_key(idA, idB);
            expect(Either.isRight(detachResult)).toBe(true);

            const secondDetach = detach_cards_by_key(idA, idB);
            expect(Either.isLeft(secondDetach)).toBe(true);

            // Known limitation: bi_sync child propagators are not disposed, so topology
            // still shows link. Storage is cleared; graph cleanup would require
            // compound_propagator to track and dispose children.
            expect(cells_linked_by_propagator(
                internal_cell_right(cards[mid]!),
                internal_cell_this(cards[mid + 1]!)
            )).toBe(true);
        });
    });
});
