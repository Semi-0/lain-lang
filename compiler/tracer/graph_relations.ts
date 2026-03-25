import { DirectedGraph } from "graphology"
import { construct_propagator } from "ppropogator"
import type { Cell } from "ppropogator/Cell/Cell"
import { cell_id, cell_strongest_base_value } from "ppropogator/Cell/Cell"
import { update_specialized_reactive_value } from "../../src/grpc/better_runtime"
import { annotate_cell_content, collapse_accessor_paths, subgraph_by_kind } from "./graph_combinators"

export type LogicVar = {
  readonly type: "logic-var"
  readonly id: number
  readonly name?: string
}

export type Substitution = Map<number, unknown>

export type GoalState = {
  readonly subst: Substitution
  readonly counter: number
}

export type Goal = (state: GoalState) => GoalState[]

type EdgeTuple = readonly [string, string]

let next_logic_var_id = 0

const make_logic_var = (id: number, name?: string): LogicVar => ({
  type: "logic-var",
  id,
  ...(name !== undefined ? { name } : {}),
})

const is_plain_object = (value: unknown): value is Record<string, unknown> =>
  value !== null &&
  typeof value === "object" &&
  !Array.isArray(value) &&
  !(value instanceof Map) &&
  !(value instanceof Set)

export const is_logic_var = (value: unknown): value is LogicVar =>
  value !== null &&
  typeof value === "object" &&
  (value as Record<string, unknown>).type === "logic-var" &&
  typeof (value as Record<string, unknown>).id === "number"

export const logic_var = (name?: string): LogicVar => {
  const id = next_logic_var_id++
  return make_logic_var(id, name)
}

export const empty_goal_state = (): GoalState => ({
  subst: new Map(),
  counter: next_logic_var_id,
})

const resolve_var = (term: unknown, subst: Substitution): unknown => {
  let current = term
  while (is_logic_var(current) && subst.has(current.id)) {
    current = subst.get(current.id)
  }
  return current
}

export const resolve = (term: unknown, subst: Substitution): unknown => {
  const resolved = resolve_var(term, subst)

  if (Array.isArray(resolved)) {
    return resolved.map((item) => resolve(item, subst))
  }

  if (is_plain_object(resolved)) {
    return Object.fromEntries(
      Object.entries(resolved).map(([key, value]) => [key, resolve(value, subst)])
    )
  }

  return resolved
}

const bind_var = (variable: LogicVar, value: unknown, subst: Substitution): Substitution => {
  const next = new Map(subst)
  next.set(variable.id, value)
  return next
}

export const unify = (left: unknown, right: unknown, subst: Substitution): Substitution | null => {
  const a = resolve_var(left, subst)
  const b = resolve_var(right, subst)

  if (is_logic_var(a) && is_logic_var(b) && a.id === b.id) {
    return subst
  }

  if (is_logic_var(a)) {
    return bind_var(a, b, subst)
  }

  if (is_logic_var(b)) {
    return bind_var(b, a, subst)
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) return null
    let current: Substitution | null = subst
    for (let i = 0; i < a.length; i++) {
      current = unify(a[i], b[i], current)
      if (current === null) return null
    }
    return current
  }

  if (is_plain_object(a) && is_plain_object(b)) {
    const aKeys = Object.keys(a)
    const bKeys = Object.keys(b)
    if (aKeys.length !== bKeys.length) return null
    if (!aKeys.every((key) => bKeys.includes(key))) return null

    let current: Substitution | null = subst
    for (const key of aKeys) {
      current = unify(a[key], b[key], current)
      if (current === null) return null
    }
    return current
  }

  return Object.is(a, b) ? subst : null
}

export const goal_equal = (left: unknown, right: unknown): Goal =>
  (state) => {
    const next = unify(left, right, state.subst)
    return next === null ? [] : [{ subst: next, counter: state.counter }]
  }

export const goal_or = (...goals: Goal[]): Goal =>
  (state) => goals.flatMap((goal) => goal(state))

export const goal_and = (...goals: Goal[]): Goal =>
  (state) => goals.reduce(
    (states, goal) => states.flatMap((candidate) => goal(candidate)),
    [state]
  )

export const fresh = (builder: (value: LogicVar) => Goal): Goal =>
  (state) => {
    const variable = make_logic_var(state.counter)
    const next_state: GoalState = {
      subst: state.subst,
      counter: state.counter + 1,
    }
    return builder(variable)(next_state)
  }

export const reify = (term: unknown, subst: Substitution): unknown => {
  const resolved = resolve_var(term, subst)

  if (Array.isArray(resolved)) {
    return resolved.map((item) => reify(item, subst))
  }

  if (is_plain_object(resolved)) {
    return Object.fromEntries(
      Object.entries(resolved).map(([key, value]) => [key, reify(value, subst)])
    )
  }

  return resolved
}

export const run_goal = <T = unknown>(
  goal: Goal,
  projection: unknown,
  limit: number = Number.POSITIVE_INFINITY
): T[] => {
  const states = goal(empty_goal_state())
  const results: T[] = []
  for (const state of states) {
    results.push(reify(projection, state.subst) as T)
    if (results.length >= limit) break
  }
  return results
}

const get_attr = (graph: DirectedGraph, id: string, attr_name: string): unknown =>
  graph.getNodeAttribute(id, attr_name)

const graph_node_attrs = (graph: DirectedGraph, id: string): Record<string, unknown> =>
  graph.getNodeAttributes(id) as Record<string, unknown>

export const node_fact = (graph: DirectedGraph, id_term: unknown, attrs_term: unknown): Goal =>
  (state) => {
    const states: GoalState[] = []
    graph.forEachNode((id, attrs) => {
      const next_id = unify(id_term, id, state.subst)
      if (next_id === null) return
      const next_attrs = unify(attrs_term, attrs as Record<string, unknown>, next_id)
      if (next_attrs === null) return
      states.push({ subst: next_attrs, counter: state.counter })
    })
    return states
  }

export const edge_fact = (graph: DirectedGraph, source_term: unknown, target_term: unknown): Goal =>
  (state) => {
    const states: GoalState[] = []
    graph.forEachEdge((_edge, _attrs, source, target) => {
      const next_source = unify(source_term, source, state.subst)
      if (next_source === null) return
      const next_target = unify(target_term, target, next_source)
      if (next_target === null) return
      states.push({ subst: next_target, counter: state.counter })
    })
    return states
  }

export const attr_fact = (
  graph: DirectedGraph,
  attr_name: string,
  id_term: unknown,
  value_term: unknown,
  predicate: ((value: unknown, attrs: Record<string, unknown>) => boolean) | null = null
): Goal =>
  (state) => {
    const states: GoalState[] = []
    graph.forEachNode((id) => {
      const attrs = graph_node_attrs(graph, id)
      const value = get_attr(graph, id, attr_name)
      if (predicate !== null && !predicate(value, attrs)) return

      const next_id = unify(id_term, id, state.subst)
      if (next_id === null) return
      const next_value = unify(value_term, value, next_id)
      if (next_value === null) return
      states.push({ subst: next_value, counter: state.counter })
    })
    return states
  }

export const kind = (graph: DirectedGraph, id_term: unknown, kind_term: unknown): Goal =>
  attr_fact(graph, "kind", id_term, kind_term)

export const namespace = (graph: DirectedGraph, id_term: unknown, namespace_term: unknown): Goal =>
  attr_fact(graph, "namespace", id_term, namespace_term)

export const level = (graph: DirectedGraph, id_term: unknown, level_term: unknown): Goal =>
  attr_fact(graph, "relationLevel", id_term, level_term)

export const label = (graph: DirectedGraph, id_term: unknown, label_term: unknown): Goal =>
  attr_fact(graph, "label", id_term, label_term)

export const value = (graph: DirectedGraph, id_term: unknown, value_term: unknown): Goal =>
  attr_fact(graph, "value", id_term, value_term, (v) => v !== undefined)

export const content = (graph: DirectedGraph, id_term: unknown, content_term: unknown): Goal =>
  attr_fact(graph, "content", id_term, content_term, (v) => v !== undefined)

export const label_prefix = (graph: DirectedGraph, id_term: unknown, prefix_term: unknown): Goal =>
  (state) => {
    const prefix = resolve(prefix_term, state.subst)
    if (typeof prefix !== "string") return []
    const states: GoalState[] = []
    graph.forEachNode((id) => {
      const raw_label = get_attr(graph, id, "label")
      if (typeof raw_label !== "string" || !raw_label.startsWith(prefix)) return
      const next = unify(id_term, id, state.subst)
      if (next === null) return
      states.push({ subst: next, counter: state.counter })
    })
    return states
  }

export const label_contains = (graph: DirectedGraph, id_term: unknown, needle_term: unknown): Goal =>
  (state) => {
    const needle = resolve(needle_term, state.subst)
    if (typeof needle !== "string") return []
    const states: GoalState[] = []
    graph.forEachNode((id) => {
      const raw_label = get_attr(graph, id, "label")
      if (typeof raw_label !== "string" || !raw_label.includes(needle)) return
      const next = unify(id_term, id, state.subst)
      if (next === null) return
      states.push({ subst: next, counter: state.counter })
    })
    return states
  }

const enumerate_reachable_pairs = (graph: DirectedGraph): EdgeTuple[] => {
  const pairs: EdgeTuple[] = []
  const seen = new Set<string>()

  graph.forEachNode((source) => {
    const visited = new Set<string>()
    const queue = [...graph.outNeighbors(source)]

    while (queue.length > 0) {
      const current = queue.shift()!
      if (visited.has(current)) continue
      visited.add(current)

      const key = `${source}->${current}`
      if (!seen.has(key)) {
        seen.add(key)
        pairs.push([source, current])
      }

      queue.push(...graph.outNeighbors(current))
    }
  })

  return pairs
}

export const reachable = (graph: DirectedGraph, source_term: unknown, target_term: unknown): Goal =>
  (state) => {
    const states: GoalState[] = []
    for (const [source, target] of enumerate_reachable_pairs(graph)) {
      const next_source = unify(source_term, source, state.subst)
      if (next_source === null) continue
      const next_target = unify(target_term, target, next_source)
      if (next_target === null) continue
      states.push({ subst: next_target, counter: state.counter })
    }
    return states
  }

const reverse_graph = (graph: DirectedGraph): DirectedGraph => {
  const reversed = new DirectedGraph()
  graph.forEachNode((id, attrs) => reversed.mergeNode(id, attrs))
  graph.forEachEdge((_edge, attrs, source, target) => {
    reversed.mergeEdge(target, source, attrs)
  })
  return reversed
}

export const downstream_of = (graph: DirectedGraph, source_term: unknown, target_term: unknown): Goal =>
  reachable(graph, source_term, target_term)

export const upstream_of = (graph: DirectedGraph, source_term: unknown, target_term: unknown): Goal =>
  reachable(reverse_graph(graph), source_term, target_term)

export const join_through = (
  graph: DirectedGraph,
  source_term: unknown,
  middle_term: unknown,
  target_term: unknown
): Goal => goal_and(
  edge_fact(graph, source_term, middle_term),
  edge_fact(graph, middle_term, target_term)
)

export const query_node_ids = (
  graph: DirectedGraph,
  build_goal: (node_var: LogicVar) => Goal,
  limit?: number
): string[] => {
  const node_var = logic_var("node")
  const results = run_goal<string>(build_goal(node_var), node_var, limit)
  return [...new Set(results.filter((id): id is string => typeof id === "string"))]
}

export const query_edges = (
  graph: DirectedGraph,
  build_goal: (source_var: LogicVar, target_var: LogicVar) => Goal,
  limit?: number
): EdgeTuple[] => {
  const source_var = logic_var("source")
  const target_var = logic_var("target")
  const results = run_goal<EdgeTuple>(build_goal(source_var, target_var), [source_var, target_var], limit)
  const unique = new Map<string, EdgeTuple>()
  for (const [source, target] of results) {
    if (typeof source !== "string" || typeof target !== "string") continue
    unique.set(`${source}->${target}`, [source, target])
  }
  return [...unique.values()]
}

export const induced_subgraph_from_ids = (graph: DirectedGraph, ids: string[]): DirectedGraph => {
  const id_set = new Set(ids)
  const result = new DirectedGraph()
  graph.forEachNode((id, attrs) => {
    if (id_set.has(id)) {
      result.mergeNode(id, attrs)
    }
  })
  graph.forEachEdge((_edge, attrs, source, target) => {
    if (id_set.has(source) && id_set.has(target)) {
      result.mergeEdge(source, target, attrs)
    }
  })
  return result
}

const connected_component = (graph: DirectedGraph, seed_ids: string[]): DirectedGraph => {
  const visited = new Set<string>()
  const queue = [...seed_ids]

  while (queue.length > 0) {
    const current = queue.shift()!
    if (visited.has(current) || !graph.hasNode(current)) continue
    visited.add(current)
    queue.push(...graph.inNeighbors(current))
    queue.push(...graph.outNeighbors(current))
  }

  return induced_subgraph_from_ids(graph, [...visited])
}

export const query_nodes_by_kind = (graph: DirectedGraph, node_kind: "cell" | "propagator"): string[] =>
  query_node_ids(graph, (node_var) => kind(graph, node_var, node_kind))

export const query_nodes_by_namespace = (graph: DirectedGraph, target_namespace: string): string[] =>
  query_node_ids(graph, (node_var) => namespace(graph, node_var, target_namespace))

export const query_nodes_by_level = (graph: DirectedGraph, target_level: number): string[] =>
  query_node_ids(graph, (node_var) => level(graph, node_var, target_level))

export const graph_rel_node_ids = (graph: DirectedGraph): string[] =>
  query_node_ids(
    graph,
    (node_var) => fresh((attrs_var) => node_fact(graph, node_var, attrs_var))
  )

export const graph_rel_edges = (graph: DirectedGraph): EdgeTuple[] =>
  query_edges(
    graph,
    (source_var, target_var) => edge_fact(graph, source_var, target_var)
  )

type LogicQueryTermSpec = unknown

type LogicQueryClauseSpec = {
  readonly op: string
  readonly [key: string]: unknown
}

type LogicQuerySpec = {
  readonly where: readonly LogicQueryClauseSpec[]
  readonly select?: LogicQueryTermSpec
  readonly limit?: number
}

const to_logic_query_spec = (input: unknown): LogicQuerySpec | null => {
  const parsed = (() => {
    if (typeof input !== "string") return input
    try {
      return JSON.parse(input)
    } catch {
      return null
    }
  })()

  if (!is_plain_object(parsed) || !Array.isArray(parsed.where)) return null

  return {
    where: parsed.where.filter((c): c is LogicQueryClauseSpec => is_plain_object(c) && typeof c.op === "string"),
    ...(parsed.select !== undefined ? { select: parsed.select } : {}),
    ...(typeof parsed.limit === "number" ? { limit: parsed.limit } : {}),
  }
}

const logic_query_term = (
  term: LogicQueryTermSpec,
  vars: Map<string, LogicVar>
): unknown => {
  if (typeof term === "string" && term.startsWith("?")) {
    const existing = vars.get(term)
    if (existing !== undefined) return existing
    const created = logic_var(term.slice(1))
    vars.set(term, created)
    return created
  }

  if (Array.isArray(term)) {
    return term.map((t) => logic_query_term(t, vars))
  }

  if (is_plain_object(term)) {
    return Object.fromEntries(
      Object.entries(term).map(([k, v]) => [k, logic_query_term(v, vars)])
    )
  }

  return term
}

const clause_goal = (
  graph: DirectedGraph,
  clause: LogicQueryClauseSpec,
  vars: Map<string, LogicVar>
): Goal | null => {
  const op = clause.op

  if (op === "and") {
    const clauses = Array.isArray(clause.clauses) ? clause.clauses : []
    const goals = clauses
      .map((c) => is_plain_object(c) ? clause_goal(graph, c as LogicQueryClauseSpec, vars) : null)
      .filter((g): g is Goal => g !== null)
    return goal_and(...goals)
  }

  if (op === "or") {
    const clauses = Array.isArray(clause.clauses) ? clause.clauses : []
    const goals = clauses
      .map((c) => is_plain_object(c) ? clause_goal(graph, c as LogicQueryClauseSpec, vars) : null)
      .filter((g): g is Goal => g !== null)
    return goals.length > 0 ? goal_or(...goals) : null
  }

  if (op === "equal") {
    return goal_equal(
      logic_query_term(clause.left, vars),
      logic_query_term(clause.right, vars)
    )
  }

  if (op === "node") {
    return node_fact(
      graph,
      logic_query_term(clause.id, vars),
      logic_query_term(clause.attrs, vars)
    )
  }

  if (op === "edge") {
    return edge_fact(
      graph,
      logic_query_term(clause.source, vars),
      logic_query_term(clause.target, vars)
    )
  }

  if (op === "kind") {
    return kind(
      graph,
      logic_query_term(clause.id, vars),
      logic_query_term(clause.value, vars)
    )
  }

  if (op === "namespace") {
    return namespace(
      graph,
      logic_query_term(clause.id, vars),
      logic_query_term(clause.value, vars)
    )
  }

  if (op === "level") {
    return level(
      graph,
      logic_query_term(clause.id, vars),
      logic_query_term(clause.value, vars)
    )
  }

  if (op === "label") {
    return label(
      graph,
      logic_query_term(clause.id, vars),
      logic_query_term(clause.value, vars)
    )
  }

  if (op === "value") {
    return value(
      graph,
      logic_query_term(clause.id, vars),
      logic_query_term(clause.value, vars)
    )
  }

  if (op === "content") {
    return content(
      graph,
      logic_query_term(clause.id, vars),
      logic_query_term(clause.value, vars)
    )
  }

  if (op === "label_prefix") {
    return label_prefix(
      graph,
      logic_query_term(clause.id, vars),
      logic_query_term(clause.value, vars)
    )
  }

  if (op === "label_contains") {
    return label_contains(
      graph,
      logic_query_term(clause.id, vars),
      logic_query_term(clause.value, vars)
    )
  }

  if (op === "reachable") {
    return reachable(
      graph,
      logic_query_term(clause.source, vars),
      logic_query_term(clause.target, vars)
    )
  }

  if (op === "downstream_of") {
    return downstream_of(
      graph,
      logic_query_term(clause.source, vars),
      logic_query_term(clause.target, vars)
    )
  }

  if (op === "upstream_of") {
    return upstream_of(
      graph,
      logic_query_term(clause.source, vars),
      logic_query_term(clause.target, vars)
    )
  }

  if (op === "join_through") {
    return join_through(
      graph,
      logic_query_term(clause.source, vars),
      logic_query_term(clause.middle, vars),
      logic_query_term(clause.target, vars)
    )
  }

  return null
}

const default_projection = (vars: Map<string, LogicVar>): Record<string, LogicVar> =>
  Object.fromEntries([...vars.entries()].map(([name, v]) => [name.slice(1), v]))

export const graph_rel_run_query = (graph: DirectedGraph, query: unknown): unknown[] => {
  const parsed = to_logic_query_spec(query)
  if (parsed === null) return []

  const vars = new Map<string, LogicVar>()
  const goals = parsed.where
    .map((c) => clause_goal(graph, c, vars))
    .filter((g): g is Goal => g !== null)
  if (goals.length === 0) return []

  const projection =
    parsed.select !== undefined
      ? logic_query_term(parsed.select, vars)
      : default_projection(vars)

  const raw_limit = parsed.limit
  const limit = typeof raw_limit === "number" && Number.isFinite(raw_limit) && raw_limit > 0
    ? Math.floor(raw_limit)
    : Number.POSITIVE_INFINITY

  return run_goal(goal_and(...goals), projection, limit)
}

export const graph_rel_exists_query = (graph: DirectedGraph, query: unknown): boolean =>
{
  const parsed = to_logic_query_spec(query)
  if (parsed === null) return false
  return graph_rel_run_query(graph, { ...parsed, limit: 1 }).length > 0
}

export const graph_query_card_network = (graph: DirectedGraph, card_id: string): DirectedGraph => {
  const seed_ids = query_node_ids(
    graph,
    (node_var) => label_prefix(graph, node_var, `CARD|${card_id}`)
  )
  return connected_component(graph, seed_ids)
}

export const graph_query_primitive_direct = (graph: DirectedGraph): DirectedGraph => {
  const collapsed = collapse_accessor_paths(graph)
  return subgraph_by_kind(collapsed, "propagator")
}

export const graph_query_call_graph = (graph: DirectedGraph): DirectedGraph =>
  subgraph_by_kind(graph, "propagator")

export const graph_query_upstream_of = (graph: DirectedGraph, node_id: string): DirectedGraph => {
  const ids = query_node_ids(
    graph,
    (node_var) => goal_or(
      goal_equal(node_var, node_id),
      upstream_of(graph, node_var, node_id)
    )
  )
  return induced_subgraph_from_ids(graph, ids)
}

export const graph_query_downstream_of = (graph: DirectedGraph, node_id: string): DirectedGraph => {
  const ids = query_node_ids(
    graph,
    (node_var) => goal_or(
      goal_equal(node_var, node_id),
      downstream_of(graph, node_id, node_var)
    )
  )
  return induced_subgraph_from_ids(graph, ids)
}

export const graph_query_reachable = (graph: DirectedGraph, source_id: string, target_id: string): boolean =>
  query_edges(
    graph,
    (source_var, target_var) => goal_and(
      reachable(graph, source_var, target_var),
      goal_equal(source_var, source_id),
      goal_equal(target_var, target_id)
    ),
    1
  ).length > 0

export type GraphInspectionRow = {
  readonly id: string
  readonly label?: string
  readonly kind?: string
  readonly namespace?: string
  readonly relationLevel?: number
  readonly value?: string
  readonly content?: string
}

const inspection_rows = (graph: DirectedGraph): GraphInspectionRow[] => {
  const rows: GraphInspectionRow[] = []
  graph.forEachNode((id, attrs) => {
    rows.push({
      id,
      label: typeof attrs?.label === "string" ? attrs.label : undefined,
      kind: typeof attrs?.kind === "string" ? attrs.kind : undefined,
      namespace: typeof attrs?.namespace === "string" ? attrs.namespace : undefined,
      relationLevel: typeof attrs?.relationLevel === "number" ? attrs.relationLevel : undefined,
      value: typeof attrs?.value === "string" ? attrs.value : undefined,
      content: typeof attrs?.content === "string" ? attrs.content : undefined,
    })
  })
  return rows
}

export const graph_query_inspect_values = (graph: DirectedGraph): GraphInspectionRow[] =>
  inspection_rows(graph).filter((row) => row.kind === "cell" && row.value !== undefined)

export const graph_query_inspect_content = (graph: DirectedGraph): GraphInspectionRow[] =>
  inspection_rows(annotate_cell_content(graph)).filter((row) => row.kind === "cell" && row.content !== undefined)

const looks_like_graph = (value: unknown): value is DirectedGraph =>
  value !== null &&
  typeof value === "object" &&
  typeof (value as DirectedGraph).forEachNode === "function" &&
  typeof (value as DirectedGraph).forEachEdge === "function"

const unary_graph_query =
  <T>(name: string, query: (graph: DirectedGraph) => T) =>
  (graph_cell: Cell<any>, output: Cell<any>) =>
    construct_propagator(
      [graph_cell],
      [output],
      () => {
        const graph = cell_strongest_base_value(graph_cell)
        if (!looks_like_graph(graph)) return
        update_specialized_reactive_value(output, cell_id(output), query(graph))
      },
      name
    )

const binary_graph_query =
  <T>(name: string, query: (graph: DirectedGraph, arg: any) => T) =>
  (graph_cell: Cell<any>, arg_cell: Cell<any>, output: Cell<any>) =>
    construct_propagator(
      [graph_cell, arg_cell],
      [output],
      () => {
        const graph = cell_strongest_base_value(graph_cell)
        const arg = cell_strongest_base_value(arg_cell)
        if (!looks_like_graph(graph) || arg === undefined || arg === null) return
        update_specialized_reactive_value(output, cell_id(output), query(graph, arg))
      },
      name
    )

const ternary_graph_query =
  <T>(name: string, query: (graph: DirectedGraph, arg1: any, arg2: any) => T) =>
  (graph_cell: Cell<any>, arg1_cell: Cell<any>, arg2_cell: Cell<any>, output: Cell<any>) =>
    construct_propagator(
      [graph_cell, arg1_cell, arg2_cell],
      [output],
      () => {
        const graph = cell_strongest_base_value(graph_cell)
        const arg1 = cell_strongest_base_value(arg1_cell)
        const arg2 = cell_strongest_base_value(arg2_cell)
        if (!looks_like_graph(graph) || arg1 === undefined || arg1 === null || arg2 === undefined || arg2 === null) return
        update_specialized_reactive_value(output, cell_id(output), query(graph, arg1, arg2))
      },
      name
    )

export const p_graph_query_card_network = binary_graph_query(
  "graph_query_card_network",
  graph_query_card_network
)

export const p_graph_query_primitive_direct = unary_graph_query(
  "graph_query_primitive_direct",
  graph_query_primitive_direct
)

export const p_graph_query_call_graph = unary_graph_query(
  "graph_query_call_graph",
  graph_query_call_graph
)

export const p_graph_query_upstream_of = binary_graph_query(
  "graph_query_upstream_of",
  graph_query_upstream_of
)

export const p_graph_query_downstream_of = binary_graph_query(
  "graph_query_downstream_of",
  graph_query_downstream_of
)

export const p_graph_query_reachable = ternary_graph_query(
  "graph_query_reachable",
  graph_query_reachable
)

export const p_graph_query_inspect_values = unary_graph_query(
  "graph_query_inspect_values",
  graph_query_inspect_values
)

export const p_graph_query_inspect_content = unary_graph_query(
  "graph_query_inspect_content",
  graph_query_inspect_content
)

export const p_graph_rel_node_ids = unary_graph_query(
  "graph_rel_node_ids",
  graph_rel_node_ids
)

export const p_graph_rel_edges = unary_graph_query(
  "graph_rel_edges",
  graph_rel_edges
)

export const p_graph_rel_nodes_by_kind = binary_graph_query(
  "graph_rel_nodes_by_kind",
  query_nodes_by_kind
)

export const p_graph_rel_nodes_by_namespace = binary_graph_query(
  "graph_rel_nodes_by_namespace",
  query_nodes_by_namespace
)

const graph_rel_nodes_by_level = (graph: DirectedGraph, target_level: unknown): string[] =>
  typeof target_level === "number"
    ? query_nodes_by_level(graph, target_level)
    : []

export const p_graph_rel_nodes_by_level = binary_graph_query(
  "graph_rel_nodes_by_level",
  graph_rel_nodes_by_level
)

export const p_graph_rel_run_query = binary_graph_query(
  "graph_rel_run_query",
  graph_rel_run_query
)

export const p_graph_rel_exists_query = binary_graph_query(
  "graph_rel_exists_query",
  graph_rel_exists_query
)
