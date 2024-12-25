import type { Propagator, Scheduler } from "../type";

// TODO: pause execute

export function construct_scheduler(): Scheduler{
    return {
        propagators_to_alert: [],
        alerted_propagators: [],
        alert_propagator(propagator: Propagator) {
            this.propagators_to_alert.unshift(propagator);
        },
        execute(): void {
            while (this.propagators_to_alert.length > 0){
                this.step_execute();
            }
        },
        step_execute(): void {
            // console.log(this.propagators_to_alert)
            const propagator = this.propagators_to_alert.pop();
            if (propagator === undefined){
                return;
            }
            propagator.activate();
            this.alerted_propagators.push(propagator);
        },
        summarize(): string {
            return `propagators_to_alert: ${this.propagators_to_alert.length}, alerted_propagators: ${this.alerted_propagators.length}`;
        }
    }
}

export const the_scheduler = construct_scheduler();

export function alert_propagator(propagator: Propagator): void {
    the_scheduler.alert_propagator(propagator);
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