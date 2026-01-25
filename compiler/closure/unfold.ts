import { 
    type Cell, cell_strongest, 
    compound_propagator, construct_cell, 
    function_to_primitive_propagator, 
    get_base_value, 
    match_args, 
    type Propagator, 
    register_predicate, 
} from "ppropogator";
import { get_hash, remove_hash_from_store } from "./hash";
import { zip } from "effect/Array";
import { type LexicalEnvironment, extend_env } from "../env";
import { expr_value, type LainElement } from "../lain_element";
import { type ClosureTemplate } from "./base";
// Import type using the type alias to work around Vite module resolution
import type { LayeredObjectType as LayeredObject } from "sando-layer/Basic/LayeredObject";
import { is_reactive_value } from "ppropogator/AdvanceReactivity/vector_clock";
import { construct_simple_generic_procedure, define_generic_procedure_handler } from "generic-handler/GenericProcedure";
import { is_contradiction, is_nothing, merge_into_contradiction } from "ppropogator/Cell/CellValue";
import { compose } from "generic-handler/built_in_generics/generic_combinator";
import { is_any } from "generic-handler/built_in_generics/generic_predicates";
import { generic_prove_staled_by } from "ppropogator/AdvanceReactivity/vector_clock";
import { to_string } from "generic-handler/built_in_generics/generic_conversation";
import { construct_better_set, is_better_set } from "generic-handler/built_in_generics/generic_better_set";
import { add_item } from "generic-handler/built_in_generics/generic_collection";
import { make_layered_procedure } from "sando-layer/Basic/LayeredProcedure";
import { layered_pass_dependences } from "ppropogator/Propagator/BuiltInProps";

export interface InternalUnfoldedClosure  {
    unfolded_network: Propagator,
    closure: ClosureTemplate,
    dispatch: (dispatched_from: Cell<string>[]) => void
    dispose: () => void
}

export interface ApplyClosureTemplate {
    closure: ClosureTemplate,
    scoped_outputs: Cell<any>[],
    scoped_inputs: Cell<any>[],
    parent_env: LexicalEnvironment,
    compile: (expr: LainElement, env: LexicalEnvironment) => any,
}

/**
 * UnfoldedClosure extends InternalUnfoldedClosure with template information.
 * This allows access to both the runtime network (from InternalUnfoldedClosure)
 * and the compile-time template (from ApplyClosureTemplate).
 */
export interface UnfoldedClosure extends InternalUnfoldedClosure {
    apply_closure_template: ApplyClosureTemplate
}

export const is_internal_unfolded_closure = register_predicate("internal_unfolded_closure", (value: InternalUnfoldedClosure) => {
    return typeof value === "object" 
    && value !== null 
    && value.unfolded_network !== undefined
    && value.closure !== undefined
    && value.dispatch !== undefined
    && value.dispose !== undefined
})

export const is_unfolded_closure = register_predicate("unfolded_closure", (value: UnfoldedClosure) => {
    return is_internal_unfolded_closure(value) && value.apply_closure_template !== undefined
})

export const is_apply_closure_template = register_predicate("apply_closure_template", (value: ApplyClosureTemplate) => {
    return typeof value === "object" 
    && value !== null  
    && value.closure !== undefined
    && value.scoped_inputs !== undefined 
    && value.scoped_outputs !== undefined 
    && value.parent_env !== undefined 
    && value.compile !== undefined
})
// if we have a seperate closure updates then it would contains timing problem
// the best way maybe is to have unfolded closure 
// allowing itself to be partly somehow
// if we have cells then we need to consider both the cell updates and the closure updates
// i think its better if we can handle that in cell

// maybe we should also allow the closure to contains the outputs

// Constants for propagator and procedure names
const PROPAGATOR_NAMES = {
    EXPAND_CLOSURES: "expand_closures",
    APPLY_CLOSURE_TEMPLATE: "apply_closure_template",
} as const

const PROCEDURE_NAMES = {
    MERGE_CLOSURE_INCREMENTAL: "merge_generic_closure_incremental",
    LAYERED_UNFOLD: "layered_unfold",
} as const

// Discriminated union type for type-safe access to closure-like values
type ClosureAccessor = 
    | { variant: 'template'; value: ApplyClosureTemplate }
    | { variant: 'unfolded'; value: UnfoldedClosure }

// Helper to convert to discriminated union (type-safe conversion)
const to_closure_accessor = (x: ApplyClosureTemplate | UnfoldedClosure): ClosureAccessor => {
    if (is_apply_closure_template(x)) {
        return { variant: 'template', value: x as ApplyClosureTemplate }
    }
    else if (is_unfolded_closure(x)) {
        return { variant: 'unfolded', value: x as UnfoldedClosure }
    }
    else {
        throw new Error("Cannot convert to ClosureAccessor: " + to_string(x))
    }
}

const eff_dispose_unfolded_closure = (unfolded_closure: InternalUnfoldedClosure) => {
    // Clean up hash store entries before disposing
    remove_hash_from_store(unfolded_closure.closure)
    if ('apply_closure_template' in unfolded_closure) {
        remove_hash_from_store((unfolded_closure as UnfoldedClosure).apply_closure_template)
    }
    unfolded_closure.dispose()
}

const eff_dispatch_inputs = (closure: UnfoldedClosure, inputs: Cell<any>[]) => {
    closure.dispatch(inputs)
}

// Type-safe getters using discriminated unions
const get_inputs_cell = (x: ClosureAccessor): Cell<any>[] => {
    switch (x.variant) {
        case 'template':
            return x.value.scoped_inputs
        case 'unfolded':
            return x.value.apply_closure_template.scoped_inputs
    }
}

export const get_scoped_inputs = (x: ApplyClosureTemplate | UnfoldedClosure): Cell<any>[] => {
    const accessor = to_closure_accessor(x)
    return get_inputs_cell(accessor)
}

export const get_scoped_outputs = (x: ApplyClosureTemplate | UnfoldedClosure): Cell<any>[] => {
    const accessor = to_closure_accessor(x)
    switch (accessor.variant) {
        case 'template':
            return accessor.value.scoped_outputs
        case 'unfolded':
            return accessor.value.apply_closure_template.scoped_outputs
    }
}

const get_outputs_cell = (x: ClosureAccessor): Cell<any>[] => {
    switch (x.variant) {
        case 'template':
            return x.value.scoped_outputs
        case 'unfolded':
            return x.value.apply_closure_template.scoped_outputs
    }
}

// Both variants have closure at the same path, so we can simplify
const get_closure = (x: ClosureAccessor): ClosureTemplate => {
    return x.value.closure
}

const get_parent_env = (x: ClosureAccessor): LexicalEnvironment => {
    switch (x.variant) {
        case 'template':
            return x.value.parent_env
        case 'unfolded':
            return x.value.apply_closure_template.parent_env
    }
}

export const get_compile = (x: ApplyClosureTemplate | UnfoldedClosure): (expr: LainElement, env: LexicalEnvironment) => any => {
    const accessor = to_closure_accessor(x)
    switch (accessor.variant) {
        case 'template':
            return accessor.value.compile
        case 'unfolded':
            return accessor.value.apply_closure_template.compile
    }
}

export const get_template = (x: ApplyClosureTemplate | UnfoldedClosure): ApplyClosureTemplate => {
    const accessor = to_closure_accessor(x)
    switch (accessor.variant) {
        case 'template':
            return accessor.value
        case 'unfolded':
            return accessor.value.apply_closure_template
    }
}


export const internal_unfold_closure = (
    closure: ClosureTemplate, 
    parent_env: LexicalEnvironment, 
    outputs_cell: Cell<any>[], 
    compile: (expr: LainElement, env: LexicalEnvironment) => Cell<any>
): InternalUnfoldedClosure =>  {
    const inputs_cell: Cell<any>[] = closure.inputs.map(expr_value).map((name: string) => construct_cell(name))

    const inputs_vars: string[] = closure.inputs.map(expr_value)
    const outputs_vars: string[] = closure.outputs.map(expr_value)

    const env = extend_env(parent_env, [
        ...zip(inputs_vars, inputs_cell),
        ...zip(outputs_vars, outputs_cell)
    ])

    const unfolded_network = compound_propagator(
        inputs_cell,
        outputs_cell,
        () => {
            closure.body.forEach((body: LainElement) => {
               compile(body, env)
            })
        },
        PROPAGATOR_NAMES.EXPAND_CLOSURES
    )    

    const dispatch = (dispatched_from: Cell<string>[]) => {
        dispatched_from.forEach((cell: Cell<string>, index: number) => {
            const input_cell = inputs_cell[index]
            if (input_cell) {
                input_cell.update(cell_strongest(cell))
            }
            // Silently handle missing input cell - this shouldn't happen in normal operation
        })
    }

    const dispose = () => {
        inputs_cell.forEach(cell => cell.dispose())
        env.dispose()
        unfolded_network.dispose()
        // Clean up hash store entries to prevent memory leaks
        remove_hash_from_store(closure)
    }

    return {
        unfolded_network: unfolded_network,
        closure,
        dispatch,
        dispose,
    }
}

export const construct_apply_closure_template = (
    closure: ClosureTemplate, 
    input_cells: Cell<any>[], 
    output_cells: Cell<any>[], 
    parent_env: LexicalEnvironment, 
    compile: (expr: LainElement, env: LexicalEnvironment) => any
): ApplyClosureTemplate => {
    return {
        closure: closure,
        scoped_inputs: input_cells,
        scoped_outputs: output_cells,
        parent_env: parent_env,
        compile: compile,
    }
}


/**
 * Constructs an unfolded closure from a template.
 * 
 * TODO: Need to find a way to pass dependencies from closure to outputs.
 * Currently, output cells may not receive proper dependency tracking.
 */
export const construct_unfolded_closure = (
    template: ApplyClosureTemplate
) => {
    const accessor = to_closure_accessor(template)
    const unfolded_closure = internal_unfold_closure(
        get_closure(accessor), 
        get_parent_env(accessor), 
        get_outputs_cell(accessor), 
        get_compile(template)
    )

    return {
        unfolded_network: unfolded_closure.unfolded_network,
        closure: unfolded_closure.closure,
        dispatch: unfolded_closure.dispatch,
        dispose: unfolded_closure.dispose,
        apply_closure_template: template,
    }
}


// this should also updates when any of the inputs or outputs are updating
export const p_apply_closure_template = (
    compile: (expr: LainElement, env: LexicalEnvironment) => any, 
    output_cells: Cell<any>[], 
    input_cells: Cell<any>[],
    parent_env: LexicalEnvironment,
) => function_to_primitive_propagator(
    PROPAGATOR_NAMES.APPLY_CLOSURE_TEMPLATE,
    (closure: ClosureTemplate, ..._inputs: any[]) => {
        const template = construct_apply_closure_template(
            closure, 
            input_cells, 
            output_cells, 
            parent_env, 
            compile
        )
        return template
    }
)

export const ce_apply_closure = (
    compile: (expr: LainElement, env: LexicalEnvironment) => any, 
    outputs: Cell<any>[], 
    inputs: Cell<any>[],
    parent_env: LexicalEnvironment,
    closure: Cell<ClosureTemplate>
) => {
    const unfolded_closure = construct_cell("unfolded closure") 

    const args = [closure, ...inputs, unfolded_closure]

    p_apply_closure_template(
        compile,
        outputs,
        inputs,
        parent_env
    )(...args)

    return unfolded_closure

}

/**
 * Unfolds a closure template into an executable closure.
 * This is an alias for construct_unfolded_closure for semantic clarity.
 */
export const unfold_apply_closure_template = construct_unfolded_closure



// Hash getters that work with the discriminated union internally
const get_closure_hash_internal = (x: ClosureAccessor) => get_hash(get_closure(x))
const get_inputs_cell_hash_internal = (x: ClosureAccessor) => get_hash(get_inputs_cell(x))
const get_outputs_cell_hash_internal = (x: ClosureAccessor) => get_hash(get_outputs_cell(x))

// Helper to calculate all template hashes at once
const calculate_template_hashes = (accessor: ClosureAccessor) => ({
    closure: get_closure_hash_internal(accessor),
    outputs: get_outputs_cell_hash_internal(accessor),
    inputs: get_inputs_cell_hash_internal(accessor)
})

// Public API maintains same signature
export const get_closure_hash = (x: ApplyClosureTemplate | UnfoldedClosure) => 
    get_closure_hash_internal(to_closure_accessor(x))
export const get_inputs_cell_hash = (x: ApplyClosureTemplate | UnfoldedClosure) => 
    get_inputs_cell_hash_internal(to_closure_accessor(x))
export const get_outputs_cell_hash = (x: ApplyClosureTemplate | UnfoldedClosure) => 
    get_outputs_cell_hash_internal(to_closure_accessor(x))

/**
 * Checks if the content and increment templates are inconsistent.
 * Templates are inconsistent if their closure, inputs, or outputs have different hashes.
 */
const source_template_inconsistent = (content: UnfoldedClosure, increment: ApplyClosureTemplate): boolean => {
    const content_accessor = to_closure_accessor(content)
    const increment_accessor = to_closure_accessor(increment)

    const content_hashes = calculate_template_hashes(content_accessor)
    const increment_hashes = calculate_template_hashes(increment_accessor)

    return (content_hashes.closure !== increment_hashes.closure) || 
           (content_hashes.outputs !== increment_hashes.outputs) || 
           (content_hashes.inputs !== increment_hashes.inputs)
}

/**
 * Unfolds a template into a closure and dispatches inputs.
 * Uses log_tracer for debugging support.
 */
const unfold_template = (template: ApplyClosureTemplate): UnfoldedClosure => {
    const unfolded_closure = unfold_apply_closure_template(template)
    eff_dispatch_inputs(unfolded_closure, get_scoped_inputs(template))
    return unfolded_closure
}

// Helper functions for merge logic - extracted for clarity and testability
const merge_nothing_content = (increment: ApplyClosureTemplate): UnfoldedClosure => {
    return unfold_template(get_template(increment))
}

const merge_better_set_content = (content: any, increment: ApplyClosureTemplate): any => {
    const new_network = unfold_template(increment)
    return add_item(content, new_network)
}

const merge_inconsistent_template = (content: UnfoldedClosure, increment: ApplyClosureTemplate): any => {
    const increment_unfold = unfold_template(increment)
    return construct_better_set([content, increment_unfold])
}

const merge_consistent_template = (content: UnfoldedClosure, _increment: ApplyClosureTemplate): UnfoldedClosure => {
    eff_dispatch_inputs(content, get_scoped_inputs(content))
    return content
}

/**
 * Merges closure incrementally, handling different content states:
 * - Nothing: Creates new unfolded closure from template
 * - BetterSet: Adds new network to the set
 * - Inconsistent template: Creates new set with both versions
 * - Consistent template: Updates inputs and returns existing closure
 */
export const merge_closure_incremental = construct_simple_generic_procedure(
    PROCEDURE_NAMES.MERGE_CLOSURE_INCREMENTAL, 
    2, 
    (content: any, increment: ApplyClosureTemplate) => {
        if (!(is_nothing(content) || is_unfolded_closure(content) || is_apply_closure_template(increment))) {
            // Invalid state - return contradiction
            return merge_into_contradiction(content, increment)
        }

        if (is_nothing(content)) {
            return merge_nothing_content(increment)
        }
        else if (is_better_set(content) && is_apply_closure_template(increment)) {
            return merge_better_set_content(content, increment)
        }
        else if (source_template_inconsistent(content, increment)) {
            return merge_inconsistent_template(content, increment)
        }
        else {
            return merge_consistent_template(content, increment)
        }
    }
)


export const layered_unfold = make_layered_procedure(PROCEDURE_NAMES.LAYERED_UNFOLD, 1, unfold_template)

/**
 * Handler for reactive value merging.
 * 
 * TODO: Dependencies from closure are not being tracked and pushed into result.
 * This could be handled in the constructor or through explicit dependency propagation.
 */
define_generic_procedure_handler(merge_closure_incremental, match_args(is_any, is_reactive_value), 
   (content: LayeredObject<UnfoldedClosure>, increment: LayeredObject<UnfoldedClosure>) => {
      if (generic_prove_staled_by(content, increment)) {
        const content_base = get_base_value(content)
        const increment_base = get_base_value(increment) as ApplyClosureTemplate

        if (is_unfolded_closure(content_base)) {
            if (source_template_inconsistent(content_base, increment_base)) {
                eff_dispose_unfolded_closure(content_base)
                const new_unfold = layered_unfold(increment_base)
                return new_unfold
            }
            else {
                return layered_pass_dependences(increment, content_base)
            }
        }
        else if (is_nothing(content_base)) {
            return layered_unfold(increment_base)
        }
        else if (is_contradiction(content_base)) {
            return content
        }
        else {
            return merge_into_contradiction(content, increment)
        }


      }
      else {
        return merge_into_contradiction(content, increment)
      }
   }
)

export const base_is_loaded_unfolded_closure = compose(get_base_value, is_unfolded_closure)

export const is_layered_apply_closure_template = register_predicate("layered_apply_closure_template", (value: LayeredObject<ApplyClosureTemplate>) => {
    return is_apply_closure_template(get_base_value(value))
})

export const install_merge_closure_incremental = (generic_merge: (content: any, increment: any) => any) => {
    define_generic_procedure_handler(generic_merge, match_args(is_any, is_layered_apply_closure_template), (content: LayeredObject<UnfoldedClosure>, increment: LayeredObject<ApplyClosureTemplate>) => {
        return merge_closure_incremental(content, increment)
    })
}


