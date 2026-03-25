export const set_union = <T>(a: Set<T>, b: Set<T>) => new Set([...a, ...b])

export const set_intersect = <T>(a: Set<T>, b: Set<T>) =>
  new Set([...a].filter((x) => b.has(x)))