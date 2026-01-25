import { get_base_value } from "ppropogator";
// Type imports separated to avoid Vite export issues
import type { Cell } from "ppropogator/Cell/Cell";
import type { Propagator } from "ppropogator/Propagator/Propagator";
import { internal_cell_dispose, cell_name, cell_strongest, construct_cell, summarize_cells } from "ppropogator/Cell/Cell";
import { NeighborType } from "ppropogator/Cell/Cell";
import { ce_identity, p_sync } from "ppropogator/Propagator/BuiltInProps";
import { construct_propagator, disposing_scan, l_apply_propagator, propagator_activate, internal_propagator_dispose } from "ppropogator/Propagator/Propagator";
import { get_global_parent, PublicStateCommand, set_global_state } from "ppropogator/Shared/PublicState";
import { alert_propagator} from "ppropogator/Shared/Scheduler/Scheduler";
import { mark_for_disposal } from "ppropogator/Shared/Generics";

// inner content would have two scenario
// 1. instruction of appending new content to the cell
// for the first scenario is easy to deal with 
// all we need to do is to make activation dynamic
// then activate it during the scheduler
// 2. instructions declaring the relationship between cells(primitive propagators)
// for the second scenario, difficult part is we need to find an alternative way construction networks
// different from how we previously did with compound propagator
// instead of directly registering the relationship with input and outputs
// it register the relationship with scoped cells
// then scoped cell pass the value to input and output
// it never directly register the propagator
// passing is always explicit
// but how can we do that?

// a way is we pack a network into an object
// then it will goes 

// but then we need a cell that is identical to any of the new patches
// intead of merging it 
// so it can just act as a pipe rather that a cell
// which might means that is a propagator
// in short we need a propagator that delay itself 
// resolve its content then perform its computation
// okay but how can we do that?




export const ce_snapshot = (input: Cell<any>) => {
    const snapshot = construct_cell<any>(`snapshot_${cell_name(input)}`)
    snapshot.update(cell_strongest(input))
    return snapshot
}

// also we need to make sure that 
// because original propagator have side effect 
// of registering itself to a global state
// we need to make sure that it never happened in here
// garbage collection is a problem
// it is working but now we need to 1. test whether this also works with support value?
// 2. handle garbage collection of cells
export const dynamic_propagator = (original_inputs: Cell<any>[], original_outputs: Cell<any>[], propagator_constructor: Cell<(...inputs: Cell<any>[]) => Propagator>) => {
    const inputs = [...original_inputs, propagator_constructor]

    const delayed = construct_propagator(
        inputs,
        original_outputs,
        () => {
            const v_ins = original_inputs.map(input => ce_snapshot(input))
            const constructor = cell_strongest(propagator_constructor) as (...inputs: Cell<any>[]) => Propagator

            const v_outs = original_outputs.map(output => {
                const v_out = construct_cell<any>(`v_out_${cell_name(output)}`)
                return v_out
            })
            
            const args = [...v_ins, ...v_outs]
            const propagator = l_apply_propagator(constructor, args, [])

            propagator_activate(get_base_value(propagator))
            // it has timing issue when it is a compound propagator

            for (const [index, output] of original_outputs.entries()) {
                output.update(cell_strongest(v_outs[index]))
            }


            // clean up 
            args.forEach(internal_cell_dispose)
            internal_propagator_dispose(get_base_value(propagator) as Propagator)
        },
        `delayed_${cell_name(original_inputs[0])}`
    )

    alert_propagator(delayed)
    // then if we can expose this setter 
    return delayed
}

