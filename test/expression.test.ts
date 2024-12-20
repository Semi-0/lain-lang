import { isSucceed } from 'pmatcher/Predicates';
import { scheme_list, scheme_number, scheme_string, scheme_symbol } from '../shared/type_constructor';
import {
    expr_self_evaluate,
    expr_var,
    expr_quoted,
    expr_application,
    expr_propagator_constructor,
    expr_primitive_cell_constructor,
    expr_tell_cell,
    expr_define
} from '../interpreter/expressions';
import { describe, it, expect } from 'bun:test';
import { make_matcher_register } from '../interpreter/matcher';
import { P } from 'pmatcher/MatchBuilder';
import { is_scheme_symbol } from '../shared/type_predicates';
describe('Expression Matchers', () => {

    describe("is scheme symbol predicate should work", () => {
        it('should work', () => {
            expect(is_scheme_symbol(scheme_symbol('x'))).toBe(true);
        });
    })

    describe('should use constant matcher to match scheme symbols', () => {
        const constant_matcher = make_matcher_register([[P.constant, "x"]])
        it('should match scheme symbols', () => {
            expect(isSucceed(constant_matcher.matcher(scheme_list([scheme_symbol('x')])))).toBe(true);
        });
    })

    describe('expr_self_evaluate', () => {
        it('should match numbers', () => {
            expect(isSucceed(expr_self_evaluate.matcher(scheme_number(3)))).toBe(true);
            expect(isSucceed(expr_self_evaluate.matcher(scheme_number(3.14)))).toBe(true);
        });

        it('should match strings', () => {
            expect(isSucceed(expr_self_evaluate.matcher(scheme_string("hello")))).toBe(true);
        });

        it('should not match symbols', () => {
            expect(isSucceed(expr_self_evaluate.matcher(scheme_symbol('test')))).toBe(false);
        });
    });

    describe('expr_var', () => {
        it('should match Scheme symbols', () => {
            expect(isSucceed(expr_var.matcher(scheme_symbol('x')))).toBe(true);
        });

        it('should not match other types', () => {
            expect(isSucceed(expr_var.matcher(scheme_number(42)))).toBe(false);
            expect(isSucceed(expr_var.matcher(scheme_string("x")))).toBe(false);
        });
    });

    describe('expr_quoted', () => {
        it('should match quoted expressions', () => {
            expect(isSucceed(expr_quoted.matcher(scheme_list([scheme_symbol('quote'), scheme_number(42)])))).toBe(true);
            expect(isSucceed(expr_quoted.matcher(scheme_list([scheme_symbol('quote'), scheme_string('symbol')])))).toBe(true);
        });
    });

    describe('expr_propagator_constructor', () => {
        it('should match propagator constructor syntax', () => {
            const validPropagator = scheme_list([
                scheme_symbol('propagator'),
                scheme_list([scheme_symbol(':inputs'), scheme_list(['x', 'y'])]),
                scheme_list([scheme_symbol(':outputs'), scheme_list(['z'])]),
                scheme_list([])
            ]);
            expect(isSucceed(expr_propagator_constructor.matcher(validPropagator))).toBe(true);
        });

        it('should match alternative syntax', () => {
            const altSyntax = scheme_list([
                scheme_symbol('prop'),
                scheme_list([scheme_symbol(':inputs'), scheme_list(['a'])]),
                scheme_list([scheme_symbol(':outputs'), scheme_list(['b'])]),
                scheme_list([])
            ]);
            expect(isSucceed(expr_propagator_constructor.matcher(altSyntax))).toBe(true);
        });

        it('should match alternative syntax with no tags', () => {
            const altSyntax = scheme_list([
                scheme_symbol('prop'),
                scheme_list(['a']),
                scheme_list(['b']),
                scheme_list([])
            ]);
            expect(isSucceed(expr_propagator_constructor.matcher(altSyntax))).toBe(true);
        });
    });

    describe('expr_primitive_cell_constructor', () => {
        it('should match cell constructor with value', () => {
            expect(isSucceed(expr_primitive_cell_constructor.matcher(scheme_list(['primitive-cell', [':value', scheme_number(42)]])))).toBe(true);
            expect(isSucceed(expr_primitive_cell_constructor.matcher(scheme_list(['<>', [':value', scheme_string('test')]])))).toBe(true);
        });

        it('should match cell constructor without value', () => {
            expect(isSucceed(expr_primitive_cell_constructor.matcher(scheme_list(['primitive-cell'])))).toBe(true);
            expect(isSucceed(expr_primitive_cell_constructor.matcher(scheme_list(['<>'])))).toBe(true);
        });
    });

    describe('expr_tell_cell', () => {
        it('should match tell cell expressions', () => {
            const cell = scheme_symbol('cell');
            expect(isSucceed(expr_tell_cell.matcher(scheme_list([scheme_symbol('tell'), cell, [':value', scheme_number(42)]])))).toBe(true);
            expect(isSucceed(expr_tell_cell.matcher(scheme_list([scheme_symbol('<~'), cell, [':value', scheme_string('test')]])))).toBe(true);
        });

        it('should match alternative syntax with no tags', () => {
            const cell = scheme_symbol('cell');
            expect(isSucceed(expr_tell_cell.matcher(scheme_list([scheme_symbol('<~'), cell, scheme_number(42)])))).toBe(true);
        });
    });

    describe('expr_define', () => {
        it('should match define expressions', () => {
            const name = scheme_symbol('x');
            expect(isSucceed(expr_define.matcher(scheme_list([scheme_symbol('define'), 
                scheme_list([scheme_symbol(':name'), name]), 
                scheme_list([scheme_symbol(':value'), scheme_number(42)])])))).toBe(true);
        });

        it('should match alternative syntax with no tags', () => {
            const name = scheme_symbol('x');
            expect(isSucceed(expr_define.matcher(scheme_list([
                scheme_symbol('define'), 
                name, 
                scheme_number(42)])))).toBe(true);
        });
    });


});