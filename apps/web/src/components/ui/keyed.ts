/** Pairs each item with a React key made by `id`, suffixing repeats so every key is unique. */
export function keyed<T>(items: readonly T[], id: (item: T) => string): { key: string; item: T }[] {
  const seen = new Map<string, number>();
  return items.map((item) => {
    const base = id(item);
    const n = seen.get(base) ?? 0;
    seen.set(base, n + 1);
    return { key: n ? `${base}#${n}` : base, item };
  });
}
