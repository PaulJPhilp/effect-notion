import { Either } from "effect";
import type { ParseError } from "effect/ParseResult";
import * as S from "effect/Schema";
import { describe, expect, it } from "vitest";
import {
  DateFromNotionDate as DateCodec,
  UrlListFromFiles as FilesCodec,
  NumberFromFormula as FormulaNumberCodec,
  PeopleIdsFromPeople as PeopleCodec,
  RelationIdsFromRelation as RelationCodec,
  PlainTextFromRichText as RichTextCodec,
  PlainTextFromTitle as TitleCodec,
} from "../src/domain/adapters/schema/index";

// Dummy domain schema covering common field types
const DomainArticle = S.Struct({
  id: S.String,
  title: S.String,
  slug: S.String,
  status: S.Union(S.Literal("Draft"), S.Literal("Published")),
  tags: S.Array(S.String),
  views: S.Number,
  featured: S.Boolean,
  url: S.optional(S.String),
  publishedAt: S.optional(S.Date),
  // New fields for broadened coverage
  authors: S.Array(S.String),
  attachments: S.Array(S.String),
  relatedIds: S.Array(S.String),
  score: S.optional(S.Number),
});

const SelectProp = S.Struct({
  select: S.Union(S.Null, S.Struct({ name: S.String })),
});

const MultiSelectProp = S.Struct({
  multi_select: S.Array(S.Struct({ name: S.String })),
});

const NumberProp = S.Struct({ number: S.Number });
const CheckboxProp = S.Struct({ checkbox: S.Boolean });
const UrlProp = S.Struct({ url: S.Union(S.Null, S.String) });

const SelectCodec = S.transform(SelectProp, S.Union(S.String, S.Undefined), {
  strict: true,
  decode: (p, _i) => p.select?.name,
  encode: (s, _a) => ({ select: s ? ({ name: s } as const) : null }),
});

const MultiSelectCodec = S.transform(MultiSelectProp, S.Array(S.String), {
  strict: true,
  decode: (p, _i) => p.multi_select.map((o) => o.name),
  encode: (arr, _a) => ({
    multi_select: arr.map((name) => ({ name }) as const) as readonly {
      readonly name: string;
    }[],
  }),
});

const NumberCodec = S.transform(NumberProp, S.Number, {
  strict: true,
  decode: (p, _i) => p.number,
  encode: (n, _a) => ({ number: n }) as const,
});

const CheckboxCodec = S.transform(CheckboxProp, S.Boolean, {
  strict: true,
  decode: (p, _i) => p.checkbox,
  encode: (b, _a) => ({ checkbox: b }) as const,
});

const UrlCodec = S.transform(UrlProp, S.Union(S.String, S.Undefined), {
  strict: true,
  decode: (p, _i) => p.url ?? undefined,
  encode: (u, _a) => ({ url: u ?? null }) as const,
});

// Generic mapping config
type FieldCodec<A, I> = S.Schema<A, I, never>;

type FieldMap = {
  notionName: string;
  codec: FieldCodec<unknown, unknown>;
};

type AdapterConfig = Record<string, FieldMap>;

// Strongly-type against DomainArticle keys for this test
type Domain = typeof DomainArticle.Type;

type DomainKey = keyof Domain;

type StrongConfig = Record<DomainKey, FieldMap>;

// Generic adapter operations powered by the config
function decodeDomain(
  cfg: StrongConfig,
  properties: Record<string, unknown>,
): Either.Either<Domain, ParseError> {
  // produce a partial, then validate with DomainArticle at the end
  const partial: Record<string, unknown> = {};
  const errors: Array<ParseError> = [];

  for (const [k, m] of Object.entries(cfg) as [DomainKey, FieldMap][]) {
    const raw = properties[m.notionName];
    const parsed = S.decodeEither(m.codec)(raw);
    if (Either.isLeft(parsed)) {
      errors.push(parsed.left);
    } else {
      partial[k] = parsed.right;
    }
  }

  if (errors.length > 0) {
    // Return first error for simplicity in this POC
    const firstError = errors[0];
    if (firstError === undefined) {
      throw new Error("Unexpected empty error array");
    }
    return Either.left(firstError);
  }
  return Either.right(partial as Domain);
}

function encodeProperties(
  cfg: StrongConfig,
  patch: Partial<Domain>,
): Either.Either<Record<string, unknown>, ParseError> {
  const props: Record<string, unknown> = {};
  const errors: Array<ParseError> = [];

  for (const [k, v] of Object.entries(patch) as [DomainKey, unknown][]) {
    const m = cfg[k];
    if (!m) {
      continue;
    }
    const encoded = S.encodeEither(m.codec)(v);
    if (Either.isLeft(encoded)) {
      errors.push(encoded.left);
    } else {
      props[m.notionName] = encoded.right;
    }
  }

  if (errors.length > 0) {
    const firstError = errors[0];
    if (firstError === undefined) {
      throw new Error("Unexpected empty error array");
    }
    return Either.left(firstError);
  }
  return Either.right(props);
}

// Dummy mapping for all field types
const cfg: StrongConfig = {
  id: {
    notionName: "Id",
    codec: RichTextCodec as FieldCodec<unknown, unknown>,
  },
  title: {
    notionName: "Title",
    codec: TitleCodec as FieldCodec<unknown, unknown>,
  },
  slug: {
    notionName: "Slug",
    codec: RichTextCodec as FieldCodec<unknown, unknown>,
  },
  status: {
    notionName: "Status",
    codec: SelectCodec as FieldCodec<unknown, unknown>,
  },
  tags: {
    notionName: "Tags",
    codec: MultiSelectCodec as FieldCodec<unknown, unknown>,
  },
  views: {
    notionName: "Views",
    codec: NumberCodec as FieldCodec<unknown, unknown>,
  },
  featured: {
    notionName: "Featured",
    codec: CheckboxCodec as FieldCodec<unknown, unknown>,
  },
  url: { notionName: "Url", codec: UrlCodec as FieldCodec<unknown, unknown> },
  publishedAt: {
    notionName: "Published At",
    codec: DateCodec as FieldCodec<unknown, unknown>,
  },
  authors: {
    notionName: "Authors",
    codec: PeopleCodec as FieldCodec<unknown, unknown>,
  },
  attachments: {
    notionName: "Attachments",
    codec: FilesCodec as FieldCodec<unknown, unknown>,
  },
  relatedIds: {
    notionName: "Related",
    codec: RelationCodec as FieldCodec<unknown, unknown>,
  },
  score: {
    notionName: "Score",
    codec: FormulaNumberCodec as FieldCodec<unknown, unknown>,
  },
};

describe("Schema-driven adapter POC", () => {
  it("decodes a Notion properties bag to domain", () => {
    const properties = {
      Id: { rich_text: [{ type: "text", text: { content: "abc" } }] },
      Title: { title: [{ type: "text", text: { content: "Hello" } }] },
      Slug: { rich_text: [{ type: "text", text: { content: "hello" } }] },
      Status: { select: { name: "Draft" } },
      Tags: { multi_select: [{ name: "a" }, { name: "b" }] },
      Views: { number: 42 },
      Featured: { checkbox: true },
      Url: { url: "https://ex.com" },
      "Published At": { date: { start: "2020-01-02T03:04:05.000Z" } },
      Authors: { people: [{ id: "u1" }, { id: "u2" }] },
      Attachments: {
        files: [
          { name: "f1", url: "https://cdn.ex/f1" },
          { name: "f2", url: "https://cdn.ex/f2" },
        ],
      },
      Related: { relation: [{ id: "p1" }, { id: "p2" }] },
      Score: { formula: { type: "number", number: 10 } },
    } as const;

    const result = decodeDomain(cfg, properties);
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      const d = result.right;
      expect(d.id).toBe("abc");
      expect(d.title).toBe("Hello");
      expect(d.slug).toBe("hello");
      expect(d.status).toBe("Draft");
      expect(d.tags).toEqual(["a", "b"]);
      expect(d.views).toBe(42);
      expect(d.featured).toBe(true);
      expect(d.url).toBe("https://ex.com");
      expect(d.publishedAt instanceof Date).toBe(true);
      expect(d.authors).toEqual(["u1", "u2"]);
      expect(d.attachments).toEqual(["https://cdn.ex/f1", "https://cdn.ex/f2"]);
      expect(d.relatedIds).toEqual(["p1", "p2"]);
      expect(d.score).toBe(10);
    }
  });

  it("encodes a domain patch back to Notion properties", () => {
    const patch: Partial<Domain> = {
      title: "New Title",
      status: "Published",
      tags: ["x", "y"],
      views: 100,
      featured: false,
      url: undefined,
      publishedAt: new Date("2021-05-06T07:08:09.000Z"),
      authors: ["a1"],
      attachments: ["https://cdn.ex/a"],
      relatedIds: ["z1", "z2"],
      score: undefined,
    };

    const result = encodeProperties(cfg, patch);
    expect(Either.isRight(result)).toBe(true);
    if (Either.isRight(result)) {
      const p = result.right as Record<string, unknown>;
      expect(
        (p.Title as { title: Array<{ text: { content: string } }> }).title[0]
          .text.content,
      ).toBe("New Title");
      expect((p.Status as { select: { name: string } }).select.name).toBe(
        "Published",
      );
      expect(
        (p.Tags as { multi_select: Array<{ name: string }> }).multi_select.map(
          (o) => o.name,
        ),
      ).toEqual(["x", "y"]);
      expect((p.Views as { number: number }).number).toBe(100);
      expect((p.Featured as { checkbox: boolean }).checkbox).toBe(false);
      expect((p.Url as { url: null }).url).toBe(null);
      expect(
        (p["Published At"] as { date: { start: string } }).date.start,
      ).toBe("2021-05-06T07:08:09.000Z");
      expect(
        (p.Authors as { people: Array<{ id: string }> }).people.map(
          (u) => u.id,
        ),
      ).toEqual(["a1"]);
      expect(
        (p.Attachments as { files: Array<{ url: string }> }).files.map(
          (f) => f.url,
        ),
      ).toEqual(["https://cdn.ex/a"]);
      expect(
        (p.Related as { relation: Array<{ id: string }> }).relation.map(
          (r) => r.id,
        ),
      ).toEqual(["z1", "z2"]);
      expect(
        (p.Score as { formula: { type: string; number: null } }).formula,
      ).toEqual({ type: "number", number: null });
    }
  });

  it("accumulates errors across fields (decode)", () => {
    const bad = {
      Title: { title: [] },
      Views: { number: "not-a-number" },
    } as Record<string, unknown>;

    const result = decodeDomain(cfg, bad);
    expect(Either.isLeft(result)).toBe(true);
  });

  it("accumulates errors across fields (encode)", () => {
    const bad = { views: "nope", tags: [1, 2] } as unknown as Partial<Domain>;
    const result = encodeProperties(cfg, bad);
    expect(Either.isLeft(result)).toBe(true);
  });
});
