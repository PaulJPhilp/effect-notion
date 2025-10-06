# Schema-Driven Adapter Pattern

This document explains the schema-driven adapter approach used to map
Notion property bags to domain entities using Effect Schema. It also shows
how to add new field mappings.

## Overview

- __Goal__: Centralize Notion<->domain mapping with typed codecs and a
  small, declarative config.
- __Key pieces__:
  - `src/domain/adapters/schema/Codecs.ts`: reusable helper codecs for
    common Notion shapes (title, rich_text, files, people, relation,
    date, formula number).
  - `src/domain/adapters/schema/Config.ts`: helpers to define
    name-annotations and build a strongly typed config.
  - `src/domain/adapters/schema/index.ts`: barrel export for clean imports.

Adapters use these to decode Notion `properties` into domain values and to
encode domain patches back into Notion `properties`.

## Quick example (blog adapter)

File: `src/domain/adapters/articles/blog.adapter.ts`

- __Keep queries unchanged__: `toNotionQuery()` remains as-is.
- __Define a subset shape__ for fields we care about.
- __Annotate field names__ using `defineDomainWithNotion`.
- __Provide codecs__ per field (helpers + a few small local codecs for
  select/multi-select).
- __Build config__ via `makeConfigFromAnnotations(ann, codecs)`.
- __Decode/encode__ via `S.decodeEither` / `S.encodeEither`.

```ts
import {
  defineDomainWithNotion,
  makeConfigFromAnnotations,
  PlainTextFromTitle,
  PlainTextFromRichText,
  DateFromNotionDate,
} from "../schema/index.js";
import * as S from "effect/Schema";

// Notion property names
const P = {
  name: "Title",
  description: "Description",
  type: "Content Type",
  tags: "Tags",
  status: "Status",
  publishedAt: "Published Date",
} as const;

// Domain subset shape (no strong dependence on optional typing details)
const shape = {
  name: S.String,
  description: S.optional(S.String),
  type: S.optional(S.String),
  tags: S.Array(S.String),
  status: S.optional(S.String),
  publishedAt: S.optional(S.Date),
};

// Name annotations (domain key -> Notion property name)
const ann = defineDomainWithNotion(shape, {
  name: P.name,
  description: P.description,
  type: P.type,
  tags: P.tags,
  status: P.status,
  publishedAt: P.publishedAt,
});

// Local codecs for select/multi-select (kept close to adapter)
const SelectProp = S.Struct({
  select: S.Union(S.Null, S.Struct({ name: S.String })),
});
const SelectCodec = S.transform(SelectProp, S.Union(S.String, S.Undefined), {
  strict: true,
  decode: (p) => p.select?.name,
  encode: (s) => ({ select: s ? ({ name: s } as const) : null }),
});

const MultiSelectProp = S.Struct({
  multi_select: S.Array(S.Struct({ name: S.String })),
});
const MultiSelectCodec = S.transform(
  MultiSelectProp,
  S.Array(S.String),
  {
    strict: true,
    decode: (p) => p.multi_select.map((o) => o.name),
    encode: (arr) => ({
      multi_select: arr.map((name) => ({ name } as const)),
    }),
  }
);

// Helper codecs from the shared module
const codecs = {
  name: PlainTextFromTitle,
  description: PlainTextFromRichText,
  type: SelectCodec,
  tags: MultiSelectCodec,
  status: SelectCodec,
  publishedAt: DateFromNotionDate,
} as const;

// Strong, name-aware config
a const cfg = makeConfigFromAnnotations(ann, codecs);

// Decode properties -> domain partial
function decodeSubset(properties: Record<string, unknown>) {
  const out: any = {};
  for (const [k, m] of Object.entries(cfg)) {
    const res = S.decodeEither(m.codec)(properties[m.notionName]);
    if (res._tag === "Right") out[k] = res.right;
  }
  return out;
}

// Encode patch -> Notion properties
function encodePatch(patch: Record<string, unknown>) {
  const props: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(patch)) {
    const m = (cfg as any)[k];
    if (!m) continue;
    const res = S.encodeEither(m.codec)(v as any);
    if (res._tag === "Right") props[m.notionName] = res.right;
  }
  return props;
}
```

## How to add a new field mapping

1. __Pick or create a codec__
   - Prefer helper codecs in `Codecs.ts` when the shape matches.
   - For Notion `select`/`multi_select`, define small local codecs like in
     the example above.

2. __Add to the domain shape__
   - Extend the `shape` object with the TypeScript/Schema type
     representing your domain field. Use `S.optional` if the Notion value
     can be absent.

3. __Annotate the Notion name__
   - Extend the object passed to `defineDomainWithNotion(shape, { ... })`
     with your new key and the exact Notion property name.

4. __Add the codec to the codec map__
   - Add the new key to the `codecs` object; use a helper codec or your
     local one.

5. __Regenerate cfg__
   - Ensure you call `makeConfigFromAnnotations(ann, codecs)` after your
     additions.

6. __Use cfg for decode/encode__
   - On read: iterate entries of `cfg` and decode each Notion property.
   - On write: iterate the patch and encode values using `cfg[key].codec`.

## Tips & conventions

- __Imports__: Use the barrel exports for cleanliness.
  ```ts
  import {
    defineDomainWithNotion,
    makeConfigFromAnnotations,
    PlainTextFromTitle,
  } from "../schema/index.js";
  ```
- __Effect best practices__: follow the project rules (Clock for time,
  typed errors, structured logging, etc.).
- __Testing__: write minimal unit tests for new codecs (round-trip encode
  and decode) similar to `test/Codecs.helpers.test.ts`.
- __TypeScript NodeNext__: remember to use `.js` extensions for runtime
  imports and `.ts` for type-only imports.
