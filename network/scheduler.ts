import type { Propagator, Scheduler } from "../type";

// TODO: pause execute

export function construct_scheduler(): Scheduler{
    return {
        propagators_to_alert: new Set<Propagator>(),
        alerted_propagators: new Set<Propagator>(),
        alert_propagator(propagator: Propagator) {
            this.propagators_to_alert.add(propagator);
        },
        execute(): void {
            while (this.propagators_to_alert.size > 0) {
                this.step_execute();
            }
        },
        step_execute(): void {
            // Get and remove first propagator from set
            const propagator = this.propagators_to_alert.values().next().value;
            this.propagators_to_alert.delete(propagator);
            
            if (propagator === undefined) {
                return;
            }
            propagator.activate();
            this.alerted_propagators.add(propagator);
        },
        summarize(): string {
            return `propagators_to_alert: ${this.propagators_to_alert.size}, alerted_propagators: ${this.alerted_propagators.size}`;
        },
        clear(): void {
            this.propagators_to_alert.clear();
            this.alerted_propagators.clear();
        }
    }
}

export const the_scheduler = construct_scheduler();

export function alert_propagator(propagator: Propagator): void {
    // console.log("alert_propagator", propagator)
    the_scheduler.alert_propagator(propagator);
}

export function clear_scheduler(): void {
    the_scheduler.clear();
}

export function execute_all(): void {
    the_scheduler.execute();
}

export function summarize(): string {
    return the_scheduler.summarize();
}

export function step_execute(): void {
    the_scheduler.step_execute();
}