import { describe, it, expect } from 'bun:test';
import { eval_expr, evaluate } from '../interpreter/evaluator';
import { scheme_list, scheme_number, scheme_string, scheme_symbol } from '../shared/type_constructor';
import { get_type_annotate, get_value, type_layer } from '../shared/type_layer';
import { empty_environment, extend, type Environment } from '../interpreter/environment/environment';
import { is_layered_object, type LayeredObject } from 'sando-layer/Basic/LayeredObject';
import { base_layer, get_base_value } from 'sando-layer/Basic/Layer';
import { execute_all } from '../network/scheduler';

describe('Evaluator', () => {
    describe('self evaluating expressions', () => {
        it('should evaluate numbers', () => {
            const expr = scheme_number(42);
            const result = eval_expr(expr);
            expect(get_value(result)).toBe(42);
        });

        it('should evaluate strings', () => {
            const expr = scheme_string('hello');
            const result = eval_expr(expr);
            expect(get_value(result)).toBe('hello');
        });
    });

    describe('variable expressions', () => {
        it('should evaluate variables in environment', () => {
            const env = empty_environment();
            const extended = extend(env, 'x', scheme_number(42));
            
            const expr = scheme_symbol('x');
            const result = evaluate(expr, extended, (expr: LayeredObject, env: Environment) => {
                return evaluate(expr, env)
            });
 
            expect(get_base_value(get_base_value(result))).toBe(42);
        });
    });

    describe('define expressions', () => {
        it('should evaluate define expressions', () => {
            const expr = scheme_list([
                scheme_symbol('define'),
                scheme_symbol('x'),
                scheme_number(42)
            ]);
            
            const result = eval_expr(expr)
            expect(result).toBeDefined();
        });
    });

    describe('cell constructor expressions', () => {
        it('should evaluate cell constructor with value', () => {
            const expr = scheme_list([
                scheme_symbol('<>'),
                scheme_list([scheme_symbol(':value'), scheme_number(42)])
            ]);
            
            const result = eval_expr(expr);
            expect(result).toBeDefined();
            expect(get_base_value(get_value(result).value)).toBe(42);
        });

        it('should evaluate cell constructor without value', () => {
            const expr = scheme_list([scheme_symbol('<>')]);
            const result = eval_expr(expr);
            expect(result).toBeDefined();
        });
    });

    describe('tell cell expressions', () => {
        it('should evaluate tell cell expressions', () => {
            // First create a cell
            const cellExpr = scheme_list([scheme_symbol("define"),
                scheme_symbol("x"),
                [scheme_symbol('<>'), scheme_number(0)]]);
            const env = empty_environment();
            const cell = evaluate(cellExpr, env, (expr: LayeredObject, env: Environment) => {
                return evaluate(expr, env)
            });

            // Then tell it a value
            const tellExpr = scheme_list([
                scheme_symbol('tell'),
                scheme_symbol('x'),
                scheme_list([scheme_symbol(':value'), scheme_number(42)])
            ]);
            
            const result = evaluate(tellExpr, env, (expr: LayeredObject, env: Environment) => {
                execute_all()
                return evaluate(expr, env)
            });
            expect(result).toBeDefined();
            expect(get_value(cell).value).toBe(42);
        });
    });

    describe('propagator constructor expressions', () => {
        it('should evaluate propagator constructor', () => {
            const expr = scheme_list([
                scheme_symbol('propagator'),
                scheme_list([scheme_symbol(':inputs'), scheme_list([scheme_symbol('x'), scheme_symbol('y')])]),
                scheme_list([scheme_symbol(':outputs'), scheme_list([scheme_symbol('z')])]),
                scheme_list([])
            ]);
            
            const result = eval_expr(expr);
            expect(result).toBeDefined();
        });
    });
});