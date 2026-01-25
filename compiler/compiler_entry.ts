import { parse, State } from "parse-combinator";
import { type LexicalEnvironment } from "./env";
import { parseExpr } from "./parser";
import { compile } from "./compiler";
import { trace_generic_procedure } from "generic-handler/GenericProcedure";
import type { Cell } from "ppropogator";
import { source_cell } from "ppropogator/DataTypes/PremisesSource";
import { incremental_compile } from "./incremental_compiler";
// code quality is awful

export const run = (code: string, env: LexicalEnvironment, source: Cell<any> | undefined = undefined, timestamp: number | undefined = undefined) => {
    const parsed = parse(parseExpr, new State(code))
    if (parsed.success) {
        const expr = parsed.value 
        if (source == undefined) {
            console.log("source is undefined, creating a new source cell")
            source = source_cell("source")
        }
        if (timestamp == undefined) {
            console.log("timestamp is undefined, setting to 0")
            timestamp = 0
        }
        return incremental_compile(expr)(env, source, timestamp)
    }
    throw new Error(`Parse failed: ${JSON.stringify(parsed)}`)
}



// if compile becomes a propagator
// it needs to ensure do we just clean the entire environment?
// or we compile the differ content?
// but how can we do that?
// export c_compile = (code: Cell<string>, env: LexicalEnvironment) 


// export const traced_result_to_graph = (result: TraceResult) => {
//     const nodes: AsciiForceNode[] = [];
//     const links: AsciiForceLink[] = [];


//     for (const [id, prop] of result.propagators) {
//         nodes.push({
//             id: id,
//             label: "prop: " + (prop.getName() || "prop")
//         });

//         // Links from inputs to prop
//         prop.getInputs().forEach((input: Cell<any>) => {
//             const inputId = cell_id(input);
//             if (result.cells.has(inputId)) {
//                 links.push({
//                     source: inputId,
//                     target: id
//                 });
//             }
//         });

//         // Links from prop to outputs
//         prop.getOutputs().forEach((output: Cell<any>) => {
//             const outputId = cell_id(output);
//             if (result.cells.has(outputId)) {
//                 links.push({
//                     source: id,
//                     target: outputId
//                 });
//             }
//         });
//     }

//     return {
//         nodes,
//         links
//     }
// }

// // Helper to render ASCII graph for a cell (adapted from compiler.test.ts)
// const renderCellGraph = (cell: Cell<any>) => {
//     const traceResult = trace_cell(cell);
//     const nodes: AsciiForceNode[] = [];
//     const links: AsciiForceLink[] = [];

//     // Add cells
//     for (const [id, c] of traceResult.cells) {
//         nodes.push({
//             id: id,
//             label: "cell: " + (cell_name(c) || id.substring(0, 5))
//         });
//     }

//     // Add propagators
//     for (const [id, prop] of traceResult.propagators) {
//         nodes.push({
//             id: id,
//             label: "prop: " + (prop.getName() || "prop")
//         });

//         // Links from inputs to prop
//         prop.getInputs().forEach(input => {
//             const inputId = cell_id(input);
//             if (traceResult.cells.has(inputId)) {
//                 links.push({
//                     source: inputId,
//                     target: id
//                 });
//             }
//         });

//         // Links from prop to outputs
//         prop.getOutputs().forEach(output => {
//             const outputId = cell_id(output);
//             if (traceResult.cells.has(outputId)) {
//                 links.push({
//                     source: id,
//                     target: outputId
//                 });
//             }
//         });
//     }

//     const graph: ForceGraph = { nodes, links };
//     return renderAsciiForceGraph(
//         graph, 
//         {   
//             width: 200, 
//             height: 400, 
//             linkDistance: 15, 
//             nodeRadius: 1 
//         }
//     );
// }

// const renderResultGraph = (result: any, env: LexicalEnvironment) => {
//     let graphed = false;

//     if (is_cell(result)) {
//         console.log("Result is a Cell.");
//         renderCellGraph(result);
//         graphed = true;
//     } else if (is_propagator(result)) {
//         const outputs = result.getOutputs();
//         // Check if outputs are connected
//         const connectedOutputs = outputs.filter((o: Cell<any>) => o.getNeighbors().size > 0);
        
//         if (connectedOutputs.length > 0) {
//             console.log("Result is a Propagator. Showing graph for first connected output.");
//             renderCellGraph(connectedOutputs[0]);
//             graphed = true;
//         } else {
//              // Try to get children
//              const children = propagator_children(result);
//              if (children && children.length > 0) {
//                  console.log("Result is a Compound Propagator. Tracing children...");
//                  for (const childRel of children) {
//                      // @ts-ignore
//                      const pid = childRel.get_id();
//                      const childProp = find_propagator_by_id(pid);
//                      if (childProp) {
//                          const inputs = childProp.getInputs();
//                          if (inputs.length > 0) {
//                              console.log(`Tracing from input of child propagator '${childProp.getName()}'...`);
//                              renderCellGraph(inputs[0]);
//                              graphed = true;
//                              break;
//                          }
//                      }
//                  }
//              }
//         }
//     } 
    
//     if (!graphed) {
//         // Fallback: check environment for interesting cells
//          const envVal = cell_strongest_base_value(env) as Map<string, Cell<any>>;
         
//          // Prioritize 'out'
//          if (envVal.has("out")) {
//              const outCell = envVal.get("out")!;
//              // Only graph if it has connections (besides just existing)
//              // But 'out' might be an output of a primitive.
//              // Check upstream propagators (which are NOT in neighbors, unfortunately)
//              // But if we traced children correctly, we should have found it.
//              // If we are here, maybe 'out' is just a cell.
//              console.log("Tracing 'out' from environment...");
//              renderCellGraph(outCell);
//              graphed = true;
//          } else {
//              // Look for any cell with neighbors (propagators)
//              for (const [key, cell] of envVal.entries()) {
//                  if (key !== "+" && key !== "-" && key !== "*" && key !== "/" && cell.getNeighbors().size > 0) {
//                       console.log(`Tracing '${key}' from environment...`);
//                       renderCellGraph(cell);
//                       graphed = true;
//                       break;
//                  }
//              }
//          }
//     }

//     if (!graphed) {
//         console.log("Could not determine a connected graph to visualize.");
//     }
// }

// export const repl = async () => {
//     set_merge(merge_layered)
//     const env = primitive_env();
//     const rl = createInterface({
//         input: process.stdin,
//         output: process.stdout,
//         prompt: 'eko> '
//     });

//     console.log("Eko Compiler REPL");
//     console.log("Type expressions to evaluate and see the propagation graph.");
    
//     rl.prompt();

//     rl.on('line', async (line) => {
//         const code = line.trim();
//         if (code) {
//             try {
//                 const result = run(code, env);
//                 await execute_all_tasks_sequential(() => {});
                
//                 if (is_string(result)){
//                     console.log(result);
//                 }
//                 else if (result) {
//                     console.log("Compilation successful.");
//                     console.log(result);
//                     renderResultGraph(result, env);
//                 }
              
//             } catch (e) {
//                 console.error("Error:", e);
//             }
//         }
//         rl.prompt();
//     }).on('close', () => {
//         console.log('Bye!');
//         process.exit(0);
//     });
// }

// if (import.meta.main) {
//     repl();
// }
