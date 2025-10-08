import type * as S from "effect/Schema";

export type AnySchema = S.Schema<unknown, unknown, unknown>;
export type FieldCodec<A, I> = S.Schema<A, I, never>;

export type FieldMap = {
  notionName: string;
  codec: FieldCodec<unknown, unknown>;
};

export type StrongConfig<K extends PropertyKey> = {
  [P in K]: FieldMap;
};

// Define a domain Struct with co-located Notion field name annotations.
// Keeps things type-safe without relying on Schema internal annotations.
export function defineDomainWithNotion<
  T extends Record<string, unknown>,
  N extends { [K in keyof T]: string }
>(shape: T, notionNames: N) {
  // We only need the mapping for config generation; avoid heavy typing.
  return { notionNames } as const;
}

// Create a StrongConfig from the annotations and a codec map
export function makeConfigFromAnnotations<
  N extends Record<string, string>,
  C extends { [K in keyof N]: FieldCodec<unknown, unknown> }
>(ann: { notionNames: N }, codecs: C): StrongConfig<keyof N> {
  const cfg = Object.fromEntries(
    Object.entries(ann.notionNames).map(([k, notionName]) => {
      const codec = (codecs as Record<string, unknown>)[k];
      if (!codec) {
        throw new Error(`Missing codec for key: ${k}`);
      }
      return [k, { notionName, codec }];
    })
  ) as StrongConfig<keyof N>;
  return cfg;
}
