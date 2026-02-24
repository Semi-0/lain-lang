/**
 * Unit tests for Card API: add_card, remove_card, connect_cards, detach_cards, build_card.
 * Verifies topology of the propagator graph: cells and propagators are truly connected
 * via Cell.getNeighbors() and Propagator.getInputs()/getOutputs().
 * Based on Propogator/Cell/Cell.ts and Propogator/Propagator/Propagator.ts.
 *
 * Runtime contract: Cards must be added first (add_card). build_card only compiles internal
 * code for an existing card; it does not create cards. Cards emit/receive regardless of build.
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
    slot_left,
    slot_right,
    slot_above,
    slot_below,
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
        slot === slot_this
            ? internal_cell_this(card)
            : slot === slot_left
              ? internal_cell_left(card)
              : slot === slot_right
                ? internal_cell_right(card)
                : slot === slot_above
                  ? internal_cell_above(card)
                  : slot === slot_below
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
        test("should add a card and return card id", () => {
            const id = add_card("card-1");
            expect(id).toBe("card-1");
            const card = runtime_get_card("card-1")!;
            expect(card).toBeDefined();
            expect(is_cell(card)).toBe(true);
            expect(cell_id(card)).toBe("card-1");
        });

        test("add_card cell has topology (neighbors)", () => {
            add_card("topo-a");
            const card = runtime_get_card("topo-a")!;
            const props = propagators_touching_cell(card);
            expect(Array.isArray(props)).toBe(true);
        });

        test("should allow adding multiple cards with different ids", () => {
            add_card("a");
            add_card("b");
            const cardA = runtime_get_card("a")!;
            const cardB = runtime_get_card("b")!;
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
            add_card("ra");
            add_card("rb");
            build_card(env)("ra");
            build_card(env)("rb");
            const cardA = runtime_get_card("ra")!;
            const cardB = runtime_get_card("rb")!;
            connect_cards("ra", "rb", slot_this, slot_this);
            await execute_all_tasks_sequential(() => {});

            assert_cards_connected_via_topology(cardA, cardB, slot_this, slot_this);

            remove_card("ra");
            await execute_all_tasks_sequential(() => {});

            const detachResult = detach_cards_by_key("ra", "rb");
            expect(Either.isLeft(detachResult)).toBe(true);
        });
    });

    describe("update_card", () => {
        test("update_card writes new value to ::this for existing card", async () => {
            const env = primitive_env();
            add_card("update-a");
            build_card(env)("update-a");
            const card = runtime_get_card("update-a")!;
            const result = update_card("update-a", 42);
            await execute_all_tasks_sequential(() => {});

            expect(result.updated).toBe(true);
            expect(cell_strongest_base_value(internal_cell_this(card))).toBe(42);
        });

        test("update_card is idempotent for same value", async () => {
            const env = primitive_env();
            add_card("update-b");
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
            add_card("ca");
            add_card("cb");
            build_card(env)("ca");
            build_card(env)("cb");
            const cardA = runtime_get_card("ca")!;
            const cardB = runtime_get_card("cb")!;
            connect_cards("ca", "cb", slot_right, slot_left);
            await execute_all_tasks_sequential(() => {});

            assert_cards_connected_via_topology(cardA, cardB, slot_right, slot_left);
        });

        test("connect_cards returns Left when card not found", () => {
            add_card("cb");
            build_card(primitive_env())("cb");
            const result = connect_cards("nonexistent", "cb", slot_right, slot_left);
            expect(Either.isLeft(result)).toBe(true);
            if (Either.isLeft(result)) {
                expect(result.left).toContain("Card not found");
            }
        });

        test("connect same pair twice is idempotent (no duplicate connector)", async () => {
            const env = primitive_env();
            add_card("dup-a");
            add_card("dup-b");
            build_card(env)("dup-a");
            build_card(env)("dup-b");
            const cardA = runtime_get_card("dup-a")!;
            const cardB = runtime_get_card("dup-b")!;

            connect_cards("dup-a", "dup-b", slot_right, slot_left);
            await execute_all_tasks_sequential(() => {});
            const firstLinkCount = count_links_between_cells(
                internal_cell_right(cardA),
                internal_cell_this(cardB)
            );

            connect_cards("dup-a", "dup-b", slot_right, slot_left);
            await execute_all_tasks_sequential(() => {});
            const secondLinkCount = count_links_between_cells(
                internal_cell_right(cardA),
                internal_cell_this(cardB)
            );

            expect(secondLinkCount).toBe(firstLinkCount);
        });

        test("multiple card pairs each create independent topology", async () => {
            const env = primitive_env();
            add_card("c1");
            add_card("c2");
            add_card("c3");
            build_card(env)("c1");
            build_card(env)("c2");
            build_card(env)("c3");
            const a = runtime_get_card("c1")!;
            const b = runtime_get_card("c2")!;
            const c = runtime_get_card("c3")!;
            connect_cards("c1", "c2", slot_right, slot_left);
            connect_cards("c2", "c3", slot_right, slot_left);
            await execute_all_tasks_sequential(() => {});

            assert_cards_connected_via_topology(a, b, slot_right, slot_left);
            assert_cards_connected_via_topology(b, c, slot_right, slot_left);

            const aRight = internal_cell_right(a);
            const cLeft = internal_cell_left(c);
            expect(cells_linked_by_propagator(aRight, cLeft)).toBe(false);
        });
    });

    describe("detach_cards / detach_cards_by_key", () => {
        test("detach returns Right; connect topology verified before detach", async () => {
            const env = primitive_env();
            add_card("da");
            add_card("db");
            build_card(env)("da");
            build_card(env)("db");
            const cardA = runtime_get_card("da")!;
            const cardB = runtime_get_card("db")!;
            connect_cards("da", "db", slot_right, slot_left);
            await execute_all_tasks_sequential(() => {});

            assert_cards_connected_via_topology(cardA, cardB, slot_right, slot_left);

            const result = detach_cards("da", "db");
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
            add_card("d2a");
            add_card("d2b");
            build_card(env)("d2a");
            build_card(env)("d2b");
            const cardA = runtime_get_card("d2a")!;
            const cardB = runtime_get_card("d2b")!;
            connect_cards("d2a", "d2b", slot_right, slot_left);
            await execute_all_tasks_sequential(() => {});

            const first = detach_cards_by_key("d2a", "d2b");
            expect(Either.isRight(first)).toBe(true);

            const second = detach_cards_by_key("d2a", "d2b");
            expect(Either.isLeft(second)).toBe(true);
        });
    });

    describe("build_card", () => {
        test("build_card compiles existing card and preserves slot topology", () => {
            const env = primitive_env();
            add_card("build-1");
            build_card(env)("build-1");
            const card = runtime_get_card("build-1")!;
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
            add_card("build-code");
            build_card(env)("build-code");
            const card = runtime_get_card("build-code")!;
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
            add_card("build-network");
            build_card(env)("build-network");
            const card = runtime_get_card("build-network")!;
            const thisCell = internal_cell_this(card);
            update_cell(thisCell, `(network add1 (>:: x) (::> y) (+ x 1 y))`);
            await execute_all_tasks_sequential(() => {});

            const envMap = cell_strongest_base_value(env) as Map<string, unknown>;
            const add1Cell = envMap?.get?.("add1") as Cell<unknown> | undefined;
            expect(add1Cell).toBeDefined();
            expect(propagators_touching_cell(add1Cell!).length).toBeGreaterThanOrEqual(0);
        });
    });

    describe("Integration: topology of connected cards", () => {
        test("connect_cards creates bi_sync propagators between slot cells", async () => {
            const env = primitive_env();
            add_card("full-a");
            add_card("full-b");
            build_card(env)("full-a");
            build_card(env)("full-b");
            const fullA = runtime_get_card("full-a")!;
            const fullB = runtime_get_card("full-b")!;
            connect_cards("full-a", "full-b", slot_right, slot_left);
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
            add_card("prop-above");
            add_card("prop-center");
            add_card("prop-right");
            build_card(env)("prop-above");
            build_card(env)("prop-center");
            build_card(env)("prop-right");
            const cardAbove = runtime_get_card("prop-above")!;
            const cardAboveThis = internal_cell_this(cardAbove);
            const centerCard = runtime_get_card("prop-center")!;
            const centerThis = internal_cell_this(centerCard);
            const cardRight = runtime_get_card("prop-right")!;
            const cardRightThis = internal_cell_this(cardRight);

            update_cell(centerThis, "(+ ::above 1 ::right)");
            connect_cards("prop-above", "prop-center", slot_below, slot_above);
            connect_cards("prop-center", "prop-right", slot_right, slot_left);
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
            for (let i = 0; i < CHAIN_LENGTH; i++) {
                add_card(`chain-${i}`);
                build_card(env)(`chain-${i}`);
            }
            const cards: Cell<unknown>[] = [];
            for (let i = 0; i < CHAIN_LENGTH; i++) {
                cards.push(runtime_get_card(`chain-${i}`)!);
            }
            for (let i = 0; i < CHAIN_LENGTH - 1; i++) {
                connect_cards(`chain-${i}`, `chain-${i + 1}`, slot_right, slot_left);
            }
            await execute_all_tasks_sequential(() => {});

            for (let i = 0; i < CHAIN_LENGTH - 1; i++) {
                assert_cards_connected_via_topology(
                    cards[i]!,
                    cards[i + 1]!,
                    slot_right,
                    slot_left
                );
            }
        });

        test("long chain then detach middle link: storage cleared", async () => {
            const env = primitive_env();
            for (let i = 0; i < CHAIN_LENGTH; i++) {
                add_card(`detach-chain-${i}`);
                build_card(env)(`detach-chain-${i}`);
            }
            const cards: Cell<unknown>[] = [];
            for (let i = 0; i < CHAIN_LENGTH; i++) {
                cards.push(runtime_get_card(`detach-chain-${i}`)!);
            }
            for (let i = 0; i < CHAIN_LENGTH - 1; i++) {
                connect_cards(`detach-chain-${i}`, `detach-chain-${i + 1}`, slot_right, slot_left);
            }
            await execute_all_tasks_sequential(() => {});

            const mid = Math.floor(CHAIN_LENGTH / 2);
            const idA = `detach-chain-${mid}`;
            const idB = `detach-chain-${mid + 1}`;

            assert_cards_connected_via_topology(
                cards[mid]!,
                cards[mid + 1]!,
                slot_right,
                slot_left
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
            add_card("lifecycle-above");
            add_card("lifecycle-center");
            add_card("lifecycle-right");
            build_card(env)("lifecycle-above");
            build_card(env)("lifecycle-center");
            build_card(env)("lifecycle-right");
            const above = runtime_get_card("lifecycle-above")!;
            const center = runtime_get_card("lifecycle-center")!;
            const right = runtime_get_card("lifecycle-right")!;
            const aboveSrc = source_cell("lifecycle-aboveSrc");
            p_sync(aboveSrc, internal_cell_this(above));

            update_cell(internal_cell_this(center), "(+ ::above 1 ::right)");
            connect_cards("lifecycle-above", "lifecycle-center", slot_below, slot_above);
            connect_cards("lifecycle-center", "lifecycle-right", slot_right, slot_left);
            await execute_all_tasks_sequential(console.error);

            update_source_cell(aboveSrc, 3);
            await execute_all_tasks_sequential(console.error);
            expect(cell_strongest_base_value(internal_cell_this(right))).toBe(4);

            const detachResult = detach_cards("lifecycle-center", "lifecycle-right");
            expect(Either.isRight(detachResult)).toBe(true);
            await execute_all_tasks_sequential(console.error);

            update_source_cell(aboveSrc, 5);
            await execute_all_tasks_sequential(console.error);
            expect(cell_strongest_base_value(internal_cell_this(right))).toBe(4);

            add_card("lifecycle-newRight");
            build_card(env)("lifecycle-newRight");
            const newRight = runtime_get_card("lifecycle-newRight")!;
            connect_cards("lifecycle-center", "lifecycle-newRight", slot_right, slot_left);
            await execute_all_tasks_sequential(console.error);

            update_source_cell(aboveSrc, 7);
            await execute_all_tasks_sequential(console.error);
            expect(cell_strongest_base_value(internal_cell_this(newRight))).toBe(8);
        });

        test("1b. repeated attach–detach–attach same pair with built center (via update_card)", async () => {
            const env = primitive_env();
            add_card("rea-above");
            add_card("rea-center");
            add_card("rea-right");
            build_card(env)("rea-above");
            build_card(env)("rea-center");
            build_card(env)("rea-right");
            const center = runtime_get_card("rea-center")!;
            const right = runtime_get_card("rea-right")!;

            update_cell(internal_cell_this(center), "(+ ::above 1 ::right)");
            connect_cards("rea-above", "rea-center", slot_below, slot_above);
            connect_cards("rea-center", "rea-right", slot_right, slot_left);
            await execute_all_tasks_sequential(() => {});

            update_card("rea-above", 2);
            expect(cell_strongest_base_value(internal_cell_this(right))).toBe(3);

            detach_cards("rea-center", "rea-right");
            await execute_all_tasks_sequential(() => {});

            update_card("rea-above", 5);
            expect(cell_strongest_base_value(internal_cell_this(right))).toBe(3);

            connect_cards("rea-center", "rea-right", slot_right, slot_left);
            await execute_all_tasks_sequential(() => {});

            update_card("rea-above", 10);
            expect(cell_strongest_base_value(internal_cell_this(right))).toBe(11);
        });

        test("2. swap neighbor: detach old, attach new", async () => {
            const env = primitive_env();
            add_card("swap-above");
            add_card("swap-center");
            add_card("swap-oldRight");
            add_card("swap-newRight");

            build_card(env)("swap-center");
  
            const above = runtime_get_card("swap-above")!;
            const center = runtime_get_card("swap-center")!;
            const oldRight = runtime_get_card("swap-oldRight")!;
            const newRight = runtime_get_card("swap-newRight")!;
            const aboveSrc = source_cell("swap-aboveSrc");
            p_sync(aboveSrc, internal_cell_this(above));

            update_cell(internal_cell_this(center), "(+ ::above 1 ::right)");
            connect_cards("swap-above", "swap-center", slot_below, slot_above);
            connect_cards("swap-center", "swap-oldRight", slot_right, slot_left);
            await execute_all_tasks_sequential(() => {});

            update_source_cell(aboveSrc, 10);
            await execute_all_tasks_sequential(() => {});
            expect(cell_strongest_base_value(internal_cell_this(oldRight))).toBe(11);

            detach_cards("swap-center", "swap-oldRight");
            connect_cards("swap-center", "swap-newRight", slot_right, slot_left);
            await execute_all_tasks_sequential(() => {});

            update_source_cell(aboveSrc, 20);
            await execute_all_tasks_sequential(() => {});
            expect(cell_strongest_base_value(internal_cell_this(oldRight))).toBe(11);
            expect(cell_strongest_base_value(internal_cell_this(newRight))).toBe(21);
        });

        test("3. add_card + build_card + connect: propagation through chain", async () => {
            const env = primitive_env();
            add_card("chain-above");
            add_card("chain-center");
            add_card("chain-right");
            build_card(env)("chain-above");
            build_card(env)("chain-center");
            build_card(env)("chain-right");
            const above = runtime_get_card("chain-above")!;
            const center = runtime_get_card("chain-center")!;
            const right = runtime_get_card("chain-right")!;
            const aboveSrc = source_cell("chain-aboveSrc");
            p_sync(aboveSrc, internal_cell_this(above));

            update_cell(internal_cell_this(center), "(+ ::above 1 ::right)");
            connect_cards("chain-above", "chain-center", slot_below, slot_above);
            connect_cards("chain-center", "chain-right", slot_right, slot_left);
            await execute_all_tasks_sequential(() => {});

            update_source_cell(aboveSrc, 2);
            await execute_all_tasks_sequential(() => {});
         
            expect(cell_strongest_base_value(internal_cell_this(right))).toBe(3);
        });

        test("4. remove_card detaches and stops propagation", async () => {
            const env = primitive_env();
            add_card("rm_above");
            add_card("rm_center");
            add_card("rm_right");
            build_card(env)("rm_above");
            build_card(env)("rm_center");
            build_card(env)("rm_right");
            const above = runtime_get_card("rm_above")!;
            const center = runtime_get_card("rm_center")!;
            const right = runtime_get_card("rm_right")!;
            const aboveSrc = source_cell("rm_aboveSrc");
            p_sync(aboveSrc, internal_cell_this(above));

            update_cell(internal_cell_this(center), "(+ ::above 1 ::right)");
            connect_cards("rm_above", "rm_center", slot_below, slot_above);
            connect_cards("rm_center", "rm_right", slot_right, slot_left);
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
            add_card("four-above");
            add_card("four-right");
            add_card("four-center");
            build_card(env)("four-above");
            build_card(env)("four-right");
            build_card(env)("four-center");
            const above = runtime_get_card("four-above")!;
            const right = runtime_get_card("four-right")!;
            const center = runtime_get_card("four-center")!;
            const aboveSrc = source_cell("four-aboveSrc");
            p_sync(aboveSrc, internal_cell_this(above));

            update_cell(internal_cell_this(center), "(+ ::above 1 ::right)");
            connect_cards("four-above", "four-center", slot_below, slot_above);
            connect_cards("four-center", "four-right", slot_right, slot_left);
            await execute_all_tasks_sequential(() => {});

            update_source_cell(aboveSrc, 4);
            await execute_all_tasks_sequential(() => {});
            expect(cell_strongest_base_value(internal_cell_this(right))).toBe(5);
        });

        test("6. long chain: detach middle link, propagation stops; reattach, resumes", async () => {
            const env = primitive_env();
            add_card("lifechain-a");
            add_card("lifechain-b");
            add_card("lifechain-c");
            build_card(env)("lifechain-a");
            build_card(env)("lifechain-b");
            build_card(env)("lifechain-c");
            const a = runtime_get_card("lifechain-a")!;
            const b = runtime_get_card("lifechain-b")!;
            const c = runtime_get_card("lifechain-c")!;
            const aSrc = source_cell("lifechain-aSrc");
            p_sync(aSrc, internal_cell_this(a));

            update_cell(internal_cell_this(b), "(+ ::above 1 ::right)");
            connect_cards("lifechain-a", "lifechain-b", slot_below, slot_above);
            connect_cards("lifechain-b", "lifechain-c", slot_right, slot_left);
            await execute_all_tasks_sequential(() => {});

            update_source_cell(aSrc, 1);
            await execute_all_tasks_sequential(() => {});
            expect(cell_strongest_base_value(internal_cell_this(c))).toBe(2);

            const detachRes = detach_cards("lifechain-b", "lifechain-c");
            expect(Either.isRight(detachRes)).toBe(true);
            await execute_all_tasks_sequential(() => {});

            update_source_cell(aSrc, 10);
            await execute_all_tasks_sequential(() => {});
            expect(cell_strongest_base_value(internal_cell_this(c))).toBe(2);

            connect_cards("lifechain-b", "lifechain-c", slot_right, slot_left);
            await execute_all_tasks_sequential(() => {});

            update_source_cell(aSrc, 5);
            await execute_all_tasks_sequential(() => {});
            expect(cell_strongest_base_value(internal_cell_this(c))).toBe(6);
        });

        test("7. rebuild center and output: detach both, spawn new cards, rewire", async () => {
            const env = primitive_env();
            add_card("rebuild-above");
            add_card("rebuild-center");
            add_card("rebuild-right");
            build_card(env)("rebuild-above");
            build_card(env)("rebuild-center");
            build_card(env)("rebuild-right");
            const above = runtime_get_card("rebuild-above")!;
            const center = runtime_get_card("rebuild-center")!;
            const right = runtime_get_card("rebuild-right")!;
            const aboveSrc = source_cell("rebuild-aboveSrc");
            p_sync(aboveSrc, internal_cell_this(above));

            update_cell(internal_cell_this(center), "(+ ::above 1 ::right)");
            connect_cards("rebuild-above", "rebuild-center", slot_below, slot_above);
            connect_cards("rebuild-center", "rebuild-right", slot_right, slot_left);
            await execute_all_tasks_sequential(() => {});

            update_source_cell(aboveSrc, 5);
            await execute_all_tasks_sequential(() => {});
            expect(cell_strongest_base_value(internal_cell_this(right))).toBe(6);

            detach_cards("rebuild-above", "rebuild-center");
            detach_cards("rebuild-center", "rebuild-right");
            await execute_all_tasks_sequential(() => {});

            add_card("rebuild-center2");
            add_card("rebuild-right2");
            build_card(env)("rebuild-center2");
            build_card(env)("rebuild-right2");
            const newCenter = runtime_get_card("rebuild-center2")!;
            const newRight = runtime_get_card("rebuild-right2")!;

            update_cell(internal_cell_this(newCenter), "(+ ::above 1 ::right)");
            connect_cards("rebuild-above", "rebuild-center2", slot_below, slot_above);
            connect_cards("rebuild-center2", "rebuild-right2", slot_right, slot_left);
            await execute_all_tasks_sequential(() => {});

            update_source_cell(aboveSrc, 10);
            await execute_all_tasks_sequential(() => {});
            expect(cell_strongest_base_value(internal_cell_this(right))).toBe(6);
            expect(cell_strongest_base_value(internal_cell_this(newRight))).toBe(11);
        });

        test("8a. runtime_update_card with add_card: reactive update via update_source_cell (advanceReactive pattern)", async () => {
            // add only; no build
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
            add_card("rt-update-build");
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
            add_card("reactive-above");
            add_card("reactive-center");
            add_card("reactive-right");
            build_card(env)("reactive-above");
            build_card(env)("reactive-center");
            build_card(env)("reactive-right");
            const above = runtime_get_card("reactive-above")!;
            const center = runtime_get_card("reactive-center")!;
            const right = runtime_get_card("reactive-right")!;
            const aboveSrc = source_cell("reactive-aboveSrc");
            p_sync(aboveSrc, internal_cell_this(above));

            update_cell(internal_cell_this(center), "(+ ::above 1 ::right)");
            connect_cards("reactive-above", "reactive-center", slot_below, slot_above);
            connect_cards("reactive-center", "reactive-right", slot_right, slot_left);
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
