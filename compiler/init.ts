import { execute_all_tasks_sequential } from "ppropogator"
import { has_pending_task } from "ppropogator/Shared/Scheduler/Scheduler"

/**
 * Starts a periodic scheduler flush at the given period (in milliseconds).
 * Calls `execute_all_tasks_sequential` on the current scheduler every `period` ms.
 *
 * @param period - Interval in milliseconds between flushes
 * @returns A dispose function to stop the periodic flush
 */
export const init_constant_scheduler_flush = (period: number) => {
  const error_handler = (e: Error) => {
    console.error("Error executing propagator in periodic flush", e)
  }
  const id = setInterval(() => {
    if (has_pending_task()) {
      execute_all_tasks_sequential(error_handler)
    }
  }, period)
  return () => {
    clearInterval(id)
  }
}
