LLM Development & Architectural Guidelines
0. Scheme-First Thinking
Before writing any code, first think about how you would express the logic in Scheme/Lisp:
* Model the solution as pure functions, recursion, and list operations (map, filter, fold).
* Define the smallest primitives, then build combinators that compose them.
* Avoid mutation; build structures by transformation, not assignment.
* Then translate that mental model into the target language, preserving the same structure and decomposition.

1. Problem-Solving Protocol (Polya’s Framework)
Before writing any code, pause and analyze the request using these steps:
* Understand: Identify the unknowns, the data, and the conditions. If conditions are insufficient or contradictory, ask for clarification.
* Devise a Plan: Find connections between data and unknowns. Look for related problems or theorems. Define the primitives and combinators needed.
* Execute: Check each step for correctness.
* Look Back: Can the result be derived differently? Can the method be reused?
2. Architectural Philosophy: Flexible & Additive Programming
* Postel’s Law: Be conservative in what you send (strict, minimal, well-defined outputs) and liberal in what you accept.
* Additive Composition: Systems must be a union of behaviors where parts cooperate without unintended interactions.
* Sharp Separation of Concerns: Each part must do one thing extremely well.
* Noise Suppression: Ensure the output of one part is "cleaner" and more specific than the input expected by the next.
3. Observability & The "First-Pass" Fallacy
Precept: Never assume a design will be correct on the first execution. Architecture must be "Glass-Box" by design.
* Anticipatory Debugging: Design with the question: "How will I see inside this when it fails?"
* Tracers & Cross-Cuts: Build tracers and logging as first-class citizens.
* Performance-Decoupled Tracing: Tracers should be togglable (via flags/env) without affecting hot-path performance, except for critical domain logic where auditability overrides speed.
4. Elegant, Simple, & Exhaustive Implementation
Precept: Code should be "plain" and "obvious," moving away from "clever" features toward exhaustive, tree-like logic.
* The Shape of Code: Elegant code looks like neatly nested boxes. Logic should follow a tree structure, mirroring the flow and branching of information.
* Exhaustive if-else: Avoid "dropping through" logic. Every if should ideally have an else. This forces the brain (and the compiler) to account for every possibility, preventing corner-case leaks.
* Atomic Optionality: When handling null or Optional, use "atomic operations" where checking and accessing are one step (e.g., Swift's if let or Java's ifPresent). Never separate the check from the access.
* No "Optical Illusions": Always use curly braces {}. Never rely on operator precedence; use parentheses () to make the evaluation order explicit.
* Avoid Control-Flow Noise: Eliminate continue and break. These are "negative" descriptions (what not to do). Instead, use "positive" descriptions by inverting conditions or extracting logic into return-early functions.
* Linear Variables: Do not reuse local variables for different purposes. Keep definitions as close to the usage as possible to minimize the "visual wire length."
5. Modularization & Functional Implementation
* Logical vs. Textual Modules: A module is a logical circuit (a function) with defined inputs/outputs, not just a separate file.
* The 40-Line Limit: Functions should be small enough to fit in the visual field without scrolling, allowing the brain to map the logic onto the visual cortex.
* Data Dominance: It is better to have 100 functions operate on one data structure than 10 functions on 10 data structures. Structure data late.
* Shallow Objects & Function Combinators: Prefer shallow objects (flat, few fields) or no objects at all; use function combinators instead. Prefer `pipe(value, f, g, h)` and explicit input/output over method chains (e.g. `obj.method1().method2()`). Combinators make data flow visible; method chains hide it.
* Minimal Object Interface: If you use objects, expose the minimal set of getters and setters. Avoid rich APIs; push logic into standalone functions that take the object as input and return explicit output.
* Side Effect Annotation: Functions with side effects must be explicitly named (e.g., saveData_io).
* Isolate Mutation: Use readonly structures by default. If mutation is necessary, isolate it into minimal getters/setters.
* Prefer `pipe` (from Effect TS) and `compose` (from `generic-handler/built_in_generics/generic_combinator.ts`) to build higher-order functions and express sequential execution: use `pipe(value, f, g, h)` for a value flowing through steps; use `compose(f, g, h)` to define a single function that runs f then g then h.
6. Domain Modeling & Anti-Overengineering
* Primitives & Combinators: Define the smallest possible primitives, then build combinators to compose them.
* Defer Sub-Problems: When a sub-problem (e.g., binding strategy) is TBD, define a stable interface boundary, implement a stub, and isolate the deferred design so the rest can proceed.
* Reject Over-Engineering: * Solve the current problem perfectly before worrying about "future" scaling.
    * Prioritize "obviously bug-free code" (simple and direct) over "code with no obvious bugs" (complex code with high test coverage).
    * Do not sacrifice clarity for "reusability" until the code is actually used twice.


## B. Protocol: "The Council of Giants" (For Complex Problems)
Before devising a plan, simulate a dialogue between these four perspectives to triangularize the solution:
1. **Socrates (The Critic):** "What is the unstated assumption here?"
2. **Hegel (The Architect):** "What synthesis recontextualizes the contradiction?"
3. **Wittgenstein (The Debugger):** "How does current language usage shape uncertainty over time?"
4. **Einstein (The Simplifier):** "If we strip frameworks, how does information move?"
**Output Requirement:** Summarize the Synthesis in `.cursor/scratchpad.md` before writing code.
