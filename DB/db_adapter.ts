import { cell_id, construct_cell, type Cell } from "ppropogator";
import { p_reactive_dispatch, source_cell, update_source_cell } from "ppropogator/DataTypes/PremisesSource";
import { compound_propagator, construct_propagator, type Propagator } from "ppropogator/Propagator/Propagator";
import { LayeredObject } from "sando-layer/Basic/LayeredObject";
import { map, subscribe } from "ppropogator/Shared/Reactivity/MiniReactor/MrCombinators";
import { env } from "bun";
import { pipe } from "effect";
import Gun, { IGunInstance } from "gun";
import { gun_db_schema_encode } from "./serialize/encode";
import { gun_db_schema_decode } from "./serialize/decode";
import { carrier_map } from "ppropogator/DataTypes/CarriedCell/HigherOrder";
import { cell_from_diagram, diagram_node, propagator_from_diagram } from "ppropogator/Shared/PublicState";
import { ce_constant, p_out } from "ppropogator/Propagator/BuiltInProps";
type Diagram = {
    cells: Cell<any>[],
    propagators: Propagator[]
}

export const p_global_diagram = (output: Cell<Diagram>) => 
    compound_propagator([], [output], () => {
        // this only sync the structure
        // but we need to ensure all the cells are updated
        const global_env_source = source_cell("global_env_source") as Cell<LayeredObject<Map<Cell<any>, any>>>

        p_reactive_dispatch(global_env_source, output)

        pipe(diagram_node,
            map((diagram: any[]) => {
                return {
                    cells: cell_from_diagram(diagram),
                    propagators: propagator_from_diagram(diagram)
                }
            }),
            subscribe((diagram: Diagram) => {
                update_source_cell(global_env_source, diagram)
            })
        )
    }, "p_global_diagram")

// maybe for decode we don't need to decode the entire db
// we only need to decode the cells when we are interesting in them
// cell or propagator reference can be resolved later using cell merge
// but how?

// but with propagator it also becomes a problem because we don't know whether propagaor serializer 
// would already initalized inside the cell
// a way maybe we just store all carried cell mindlessly
// then we get the propagator constructor using a dispatcher 
export const store = (carrier: Cell<any>, root_key: string, gun: IGunInstance) => 
    carrier_map(
        ce_constant(
            (input: Cell<any>, output: Cell<any>) => {
                p_out(
                    (input: Cell<any>) => {
                       gun
                        .get(root_key)
                        .get(cell_id(input))
                        .put(gun_db_schema_encode(input))
                    }
                )(input)
            }
        ),
        carrier,
        construct_cell("gun_teleport_output")
    ) 



export const p_gun_teleport = (
  store_carrier: Cell<LayeredObject<Map<Propagator, any>>>,
  gun: IGunInstance
) => compound_propagator(
    [store_carrier], 
    [],
    () => {
        store(store_carrier, "all_diagrams", gun)
    },
    "p_gun_teleport"
)