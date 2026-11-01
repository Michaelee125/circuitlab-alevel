let counter = 0;

/** Short, collision-resistant ids that work in browsers and Node. */
export function createId(prefix = 'id'): string {
  counter = (counter + 1) % 1_679_616;
  const random = Math.random().toString(36).slice(2, 7);
  return `${prefix}_${Date.now().toString(36)}${counter.toString(36)}${random}`;
}

/** Reference designator, e.g. R1, R2, A1. */
export function nextDesignator(
  existing: { id: string; kind: string; label?: string }[],
  kind: string,
  prefix: string,
): string {
  const used = new Set(
    existing
      .filter((c) => c.kind === kind)
      .map((c) => c.label)
      .filter((l): l is string => Boolean(l)),
  );
  let n = 1;
  while (used.has(`${prefix}${n}`)) n += 1;
  return `${prefix}${n}`;
}
