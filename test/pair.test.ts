import { cons, cons_cell, is_pair, car, cdr, array_to_pair, map } from '../network/data_types';
import { the_nothing } from '../type';
import { describe, it, expect } from 'bun:test'; 

describe('Data Types', () => {
    describe('cons', () => {
        it('should create a pair with two values', () => {
            const pair = cons(1, 2);
            expect(pair.fst).toBe(1);
            expect(pair.snd).toBe(2);
        });

        it('should work with different types', () => {
            const pair = cons("hello", null);
            expect(pair.fst).toBe("hello");
            expect(pair.snd).toBe(null);
        });
    });

    describe('cons_cell', () => {
        it('should create a pair from two cells', () => {
            const cell1 = { value: 1 };
            const cell2 = { value: 2 };
            const pair = cons_cell(cell1, cell2);
            expect(pair.fst).toBe(1);
            expect(pair.snd).toBe(2);
        });
    });

    describe('is_pair', () => {
        it('should return true for valid pairs', () => {
            const pair = cons(1, 2);
            expect(is_pair(pair)).toBe(true);
        });

        it('should return false for non-pairs', () => {
            expect(is_pair(undefined)).toBe(false);
            expect(is_pair({ fst: 1 })).toBe(false);
            expect(is_pair({ snd: 2 })).toBe(false);
            expect(is_pair({})).toBe(false);
        });
    });

    describe('car and cdr', () => {
        it('should extract first and second elements from a pair', () => {
            const pair = cons(1, 2);
            expect(car(pair)).toBe(1);
            expect(cdr(pair)).toBe(2);
        });

        it('should return the_nothing for non-pairs', () => {
            expect(car(undefined)).toBe(the_nothing);
            expect(cdr(undefined)).toBe(the_nothing);
        });
    });

    describe('array_to_pair', () => {
        it('should convert an array to nested pairs', () => {
            const array = [1, 2, 3];
            const result = array_to_pair(array);
            
            expect(is_pair(result)).toBe(true);
            expect(car(result)).toBe(1);
            expect(car(cdr(result))).toBe(2);
            expect(car(cdr(cdr(result)))).toBe(3);
            expect(cdr(cdr(cdr(result)))).toBe(the_nothing);
        });

        it('should handle empty array', () => {
            expect(array_to_pair([])).toBe(the_nothing);
        });
    });

    describe('map', () => {
        it('should apply function to each element in the pair structure', () => {
            const pair = array_to_pair([1, 2, 3]);
            const doubled = map(pair, x => x * 2);
            console.log(pair);
            console.log(doubled);
            expect(car(doubled)).toBe(2);
            expect(car(cdr(doubled))).toBe(4);
            expect(car(cdr(cdr(doubled)))).toBe(6);
            expect(cdr(cdr(cdr(doubled)))).toBe(the_nothing);
        });

        it('should handle empty pairs', () => {
            const result = map(the_nothing, x => x * 2);
            expect(result).toBe(the_nothing);
        });

        it('should work with type transformations', () => {
            const pair = array_to_pair([1, 2, 3]);
            const stringified = map(pair, x => x.toString());
            
            expect(car(stringified)).toBe("1");
            expect(car(cdr(stringified))).toBe("2");
            expect(car(cdr(cdr(stringified)))).toBe("3");
        });
    });
});

import { filter } from '../network/data_types';
describe('filter', () => {
    it('should filter elements in the pair structure', () => {
        const pair = array_to_pair([1, 2, 3, 4, 5]);
        const filtered = filter(pair, x => x % 2 === 0);
        expect(car(filtered)).toBe(2);
        expect(car(cdr(filtered))).toBe(4);
    });
});