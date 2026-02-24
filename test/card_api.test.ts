/**
 * Unit tests for Card API: add_card, remove_card, connect_cards, detach_cards, build_card.
 * Verifies topology of the propagator graph: cells and propagators are truly connected
 * via Cell.getNeighbors() and Propagator.getInputs()/getOutputs().
 * Based on Propogator/Cell/Cell.ts and Propogator/Propagator/Propagator.ts.
 *
 * Note: detach marks the connector (and its bi_sync children, via relation hierarchy) for disposal;
 * actual cleanup runs in execute_all_tasks_sequential. Run it after detach so propagation stops (see tests 1, 6).
 * Storage is cleared immediately on detach.
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
    update_card,
    runtime_get_card,
    internal_cell_this,
    internal_cell_left,
    internal_cell_right,
    internal_cell_above,
    internal_cell_below,
    slot_this,
} from "../src/grpc/card";
import { primitive_env } from "../compiler/closure";
import { init_system } from "../compiler/incremental_compiler";
import { update_cell } from "ppropogator/Cell/Cell";
import { p_sync } from "ppropogator/Propagator/BuiltInProps";
import {
    source_cell,
    update_source_cell,
} from "ppropogator/DataTypes/PremisesSource";

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
                : slot === "::above"
                  ? internal_cell_above(card)
                  : slot === "::below"
                    ? internal_cell_below(card)
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

    describe("update_card", () => {
        test("update_card writes new value to ::this for existing card", async () => {
            const env = primitive_env();
            const card = build_card(env)("update-a");
            const result = update_card("update-a", 42);
            await execute_all_tasks_sequential(() => {});

            expect(result.updated).toBe(true);
            expect(cell_strongest_base_value(internal_cell_this(card))).toBe(42);
        });

        test("update_card is idempotent for same value", async () => {
            const env = primitive_env();
            build_card(env)("update-b");

            const first = update_card("update-b", "same");
            await execute_all_tasks_sequential(() => {});
            const second = update_card("update-b", "same");
            await execute_all_tasks_sequential(() => {});

            expect(first.updated).toBe(true);
            expect(second.updated).toBe(false);
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

        test("connect same pair twice is idempotent (no duplicate connector)", async () => {
            const env = primitive_env();
            const cardA = build_card(env)("dup-a");
            const cardB = build_card(env)("dup-b");

            connect_cards(cardA, cardB, "::right", "::left");
            await execute_all_tasks_sequential(() => {});
            const firstLinkCount = count_links_between_cells(
                internal_cell_right(cardA),
                internal_cell_this(cardB)
            );

            connect_cards(cardA, cardB, "::right", "::left");
            await execute_all_tasks_sequential(() => {});
            const secondLinkCount = count_links_between_cells(
                internal_cell_right(cardA),
                internal_cell_this(cardB)
            );

            expect(secondLinkCount).toBe(firstLinkCount);
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
        test("(+ ::above 1 ::right) with above and right neighbors: update above ::this, right ::this receives", async () => {
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

            // We did not run execute_all_tasks_sequential after detach, so cleanup never ran:
            // connector and bi_sync children are only marked for disposal; they get disposed when
            // cleanup runs (inside the next execute_all_tasks_sequential). So topology still shows the link.
            expect(cells_linked_by_propagator(
                internal_cell_right(cards[mid]!),
                internal_cell_this(cards[mid + 1]!)
            )).toBe(true);
        });
    });

    describe("Integration: lifecycle + propagation", () => {
        // Use above-center-right layout: center::this holds code and is synced with above::below
        // (not o
        // verwritten by numbers). Drive above::this via source_cell + p_sync for reactive updates.
        test("1. detach then spawn new card and attach: propagation stops then resumes", async () => {
            const env = primitive_env();
            const above = build_card(env)("lifecycle-above");
            const center = build_card(env)("lifecycle-center");
            const right = build_card(env)("lifecycle-right");
            const aboveSrc = source_cell("lifecycle-aboveSrc");
            p_sync(aboveSrc, internal_cell_this(above));

            update_cell(internal_cell_this(center), "(+ ::above 1 ::right)");
            connect_cards(above, center, "::below", "::above");
            connect_cards(center, right, "::right", "::left");
            await execute_all_tasks_sequential(console.error);

            update_source_cell(aboveSrc, 3);
            await execute_all_tasks_sequential(console.error);
            expect(cell_strongest_base_value(internal_cell_this(right))).toBe(4);

            const detachResult = detach_cards(center, right);
            expect(Either.isRight(detachResult)).toBe(true);
            await execute_all_tasks_sequential(console.error);

            update_source_cell(aboveSrc, 5);
            await execute_all_tasks_sequential(console.error);
            expect(cell_strongest_base_value(internal_cell_this(right))).toBe(4);

            const newRight = build_card(env)("lifecycle-newRight");
            connect_cards(center, newRight, "::right", "::left");
            await execute_all_tasks_sequential(console.error);

            update_source_cell(aboveSrc, 7);
            await execute_all_tasks_sequential(console.error);
            expect(cell_strongest_base_value(internal_cell_this(newRight))).toBe(8);
        });

        test("2. swap neighbor: detach old, attach new", async () => {
            const env = primitive_env();
            const above = build_card(env)("swap-above");
            const center = build_card(env)("swap-center");
            const oldRight = build_card(env)("swap-oldRight");
            const newRight = build_card(env)("swap-newRight");
            const aboveSrc = source_cell("swap-aboveSrc");
            p_sync(aboveSrc, internal_cell_this(above));

            update_cell(internal_cell_this(center), "(+ ::above 1 ::right)");
            connect_cards(above, center, "::below", "::above");
            connect_cards(center, oldRight, "::right", "::left");
            await execute_all_tasks_sequential(() => {});

            update_source_cell(aboveSrc, 10);
            await execute_all_tasks_sequential(() => {});
            expect(cell_strongest_base_value(internal_cell_this(oldRight))).toBe(11);

            detach_cards(center, oldRight);
            connect_cards(center, newRight, "::right", "::left");
            await execute_all_tasks_sequential(() => {});

            update_source_cell(aboveSrc, 20);
            await execute_all_tasks_sequential(() => {});
            expect(cell_strongest_base_value(internal_cell_this(oldRight))).toBe(11);
            expect(cell_strongest_base_value(internal_cell_this(newRight))).toBe(21);
        });

        test("3. add_card + build_card + connect: propagation through chain", async () => {
            const env = primitive_env();

            const above = build_card(env)("chain-above");
            const center = build_card(env)("chain-center");
            const right = build_card(env)("chain-right");
            const aboveSrc = source_cell("chain-aboveSrc");
            p_sync(aboveSrc, internal_cell_this(above));

            update_cell(internal_cell_this(center), "(+ ::above 1 ::right)");
            connect_cards(above, center, "::below", "::above");
            connect_cards(center, right, "::right", "::left");
            await execute_all_tasks_sequential(() => {});

            update_source_cell(aboveSrc, 2);
            await execute_all_tasks_sequential(() => {});
         
            expect(cell_strongest_base_value(internal_cell_this(right))).toBe(3);
        });

        test("4. remove_card detaches and stops propagation", async () => {
            const env = primitive_env();
            const above = build_card(env)("rm_above");
            const center = build_card(env)("rm_center");
            const right = build_card(env)("rm_right");
  
            const aboveSrc = source_cell("rm_aboveSrc");
            p_sync(aboveSrc, internal_cell_this(above));

            update_cell(internal_cell_this(center), "(+ ::above 1 ::right)");
            connect_cards(above, center, "::below", "::above");
            connect_cards(center, right, "::right", "::left");
            await execute_all_tasks_sequential(() => {});

            update_source_cell(aboveSrc, 1);
            await execute_all_tasks_sequential(() => {});
            expect(cell_strongest_base_value(internal_cell_this(right))).toBe(2);

            remove_card("rm_center");
            await execute_all_tasks_sequential(() => {});

            update_source_cell(aboveSrc, 5);
            await execute_all_tasks_sequential(() => {});
            expect(cell_strongest_base_value(internal_cell_this(right))).toBe(2);

            expect(Either.isLeft(detach_cards_by_key("rm_above", "rm_center"))).toBe(true);
            expect(Either.isLeft(detach_cards_by_key("rm_center", "rm_right"))).toBe(true);
        });

        test("5. two directions: above and right propagation", async () => {
            const env = primitive_env();
            const above = build_card(env)("four-above");
            const right = build_card(env)("four-right");
            const center = build_card(env)("four-center");
            const aboveSrc = source_cell("four-aboveSrc");
            p_sync(aboveSrc, internal_cell_this(above));

            update_cell(internal_cell_this(center), "(+ ::above 1 ::right)");
            connect_cards(above, center, "::below", "::above");
            connect_cards(center, right, "::right", "::left");
            await execute_all_tasks_sequential(() => {});

            update_source_cell(aboveSrc, 4);
            await execute_all_tasks_sequential(() => {});
            expect(cell_strongest_base_value(internal_cell_this(right))).toBe(5);
        });

        test("6. long chain: detach middle link, propagation stops; reattach, resumes", async () => {
            const env = primitive_env();
            const a = build_card(env)("lifechain-a");
            const b = build_card(env)("lifechain-b");
            const c = build_card(env)("lifechain-c");
            const aSrc = source_cell("lifechain-aSrc");
            p_sync(aSrc, internal_cell_this(a));

            update_cell(internal_cell_this(b), "(+ ::above 1 ::right)");
            connect_cards(a, b, "::below", "::above");
            connect_cards(b, c, "::right", "::left");
            await execute_all_tasks_sequential(() => {});

            update_source_cell(aSrc, 1);
            await execute_all_tasks_sequential(() => {});
            expect(cell_strongest_base_value(internal_cell_this(c))).toBe(2);

            const detachRes = detach_cards(b, c);
            expect(Either.isRight(detachRes)).toBe(true);
            await execute_all_tasks_sequential(() => {});

            update_source_cell(aSrc, 10);
            await execute_all_tasks_sequential(() => {});
            expect(cell_strongest_base_value(internal_cell_this(c))).toBe(2);

            connect_cards(b, c, "::right", "::left");
            await execute_all_tasks_sequential(() => {});

            update_source_cell(aSrc, 5);
            await execute_all_tasks_sequential(() => {});
            expect(cell_strongest_base_value(internal_cell_this(c))).toBe(6);
        });

        test("7. rebuild center and output: detach both, spawn new cards, rewire", async () => {
            const env = primitive_env();
            const above = build_card(env)("rebuild-above");
            const center = build_card(env)("rebuild-center");
            const right = build_card(env)("rebuild-right");
            const aboveSrc = source_cell("rebuild-aboveSrc");
            p_sync(aboveSrc, internal_cell_this(above));

            update_cell(internal_cell_this(center), "(+ ::above 1 ::right)");
            connect_cards(above, center, "::below", "::above");
            connect_cards(center, right, "::right", "::left");
            await execute_all_tasks_sequential(() => {});

            update_source_cell(aboveSrc, 5);
            await execute_all_tasks_sequential(() => {});
            expect(cell_strongest_base_value(internal_cell_this(right))).toBe(6);

            detach_cards(above, center);
            detach_cards(center, right);
            await execute_all_tasks_sequential(() => {});

            const newCenter = build_card(env)("rebuild-center2");
            const newRight = build_card(env)("rebuild-right2");

            update_cell(internal_cell_this(newCenter), "(+ ::above 1 ::right)");
            connect_cards(above, newCenter, "::below", "::above");
            connect_cards(newCenter, newRight, "::right", "::left");
            await execute_all_tasks_sequential(() => {});

            update_source_cell(aboveSrc, 10);
            await execute_all_tasks_sequential(() => {});
            expect(cell_strongest_base_value(internal_cell_this(right))).toBe(6);
            expect(cell_strongest_base_value(internal_cell_this(newRight))).toBe(11);
        });

        test("8a. runtime_update_card with add_card: reactive update via update_source_cell (advanceReactive pattern)", async () => {
            add_card("rt-update-a");
            const card = runtime_get_card("rt-update-a");
            expect(card).toBeDefined();
            const thisCell = internal_cell_this(card!);

            const result = update_card("rt-update-a", 42);
            expect(result.updated).toBe(true);
            await execute_all_tasks_sequential(() => {});
            expect(cell_strongest_base_value(thisCell)).toBe(42);

            update_card("rt-update-a", 100);
            await execute_all_tasks_sequential(() => {});
            expect(cell_strongest_base_value(thisCell)).toBe(100);
        });

        test("8b. runtime_update_card with build_card uses shared user_inputs source", async () => {
            const env = primitive_env();
            build_card(env)("rt-update-build");
            const card = runtime_get_card("rt-update-build");
            expect(card).toBeDefined();
            const thisCell = internal_cell_this(card!);

            const result = update_card("rt-update-build", 7);
            expect(result.updated).toBe(true);
            await execute_all_tasks_sequential(() => {});
            const actual = cell_strongest_base_value(thisCell);
            expect(actual).toBe(7);
        });

        test("8. reactive updates: multiple sequential input changes propagate", async () => {
            const env = primitive_env();
            const above = build_card(env)("reactive-above");
            const center = build_card(env)("reactive-center");
            const right = build_card(env)("reactive-right");
            const aboveSrc = source_cell("reactive-aboveSrc");
            p_sync(aboveSrc, internal_cell_this(above));

            update_cell(internal_cell_this(center), "(+ ::above 1 ::right)");
            connect_cards(above, center, "::below", "::above");
            connect_cards(center, right, "::right", "::left");
            await execute_all_tasks_sequential(() => {});

            update_source_cell(aboveSrc, 3);
            await execute_all_tasks_sequential(() => {});
            expect(cell_strongest_base_value(internal_cell_this(right))).toBe(4);

            update_source_cell(aboveSrc, 10);
            await execute_all_tasks_sequential(() => {});
            expect(cell_strongest_base_value(internal_cell_this(right))).toBe(11);

            update_source_cell(aboveSrc, 0);
            await execute_all_tasks_sequential(() => {});
            expect(cell_strongest_base_value(internal_cell_this(right))).toBe(1);
        });
    });
});


// deprecate add card tomorrow
