import * as S from "effect/Schema";

// Common minimal Notion property shapes (POC-oriented)
export const TitleProp = S.Struct({
  title: S.Array(
    S.Struct({ type: S.Literal("text"), text: S.Struct({ content: S.String }) })
  ),
});

export const RichTextProp = S.Struct({
  rich_text: S.Array(
    S.Struct({ type: S.Literal("text"), text: S.Struct({ content: S.String }) })
  ),
});

export const UrlProp = S.Struct({ url: S.Union(S.Null, S.String) });

export const EmailProp = S.Struct({ email: S.Union(S.Null, S.String) });

export const FilesProp = S.Struct({
  files: S.Array(
    S.Struct({
      name: S.String,
      url: S.String,
    })
  ),
});

export const PeopleProp = S.Struct({
  people: S.Array(S.Struct({ id: S.String })),
});

export const RelationProp = S.Struct({
  relation: S.Array(S.Struct({ id: S.String })),
});

export const DateProp = S.Struct({
  date: S.Union(S.Null, S.Struct({ start: S.String })),
});

export const NumberProp = S.Struct({ number: S.Union(S.Null, S.Number) });

export const CheckboxProp = S.Struct({ checkbox: S.Boolean });

export const FormulaNumberProp = S.Struct({
  formula: S.Struct({
    type: S.Literal("number"),
    number: S.Union(S.Null, S.Number),
  }),
});

// Helper codecs for common shapes
// Note: All transforms follow effect/Schema transform contract where
// decode returns the target's encoded type and encode receives it.

// Plain text from Title
export const PlainTextFromTitle = S.transform(TitleProp, S.String, {
  strict: true,
  decode: (p) => p.title.map((t) => t.text.content).join(""),
  encode: (s) => ({
    title: [{ type: "text" as const, text: { content: s } }],
  }),
});

// Plain text from Rich Text
export const PlainTextFromRichText = S.transform(RichTextProp, S.String, {
  strict: true,
  decode: (p) => p.rich_text.map((t) => t.text.content).join(""),
  encode: (s) => ({
    rich_text: [{ type: "text" as const, text: { content: s } }],
  }),
});

// URLs from Files (list)
export const UrlListFromFiles = S.transform(FilesProp, S.Array(S.String), {
  strict: true,
  decode: (p) => p.files.map((f) => f.url),
  encode: (urls) => ({ files: urls.map((url, i) => ({ name: `file-${i+1}`, url })) }),
});

// First URL from Files (optional)
export const FirstUrlFromFiles = S.transform(
  FilesProp,
  S.Union(S.String, S.Undefined),
  {
    strict: true,
    decode: (p) => p.files[0]?.url,
    encode: (u) => ({ files: u ? [{ name: "file-1", url: u }] : [] }),
  }
);

// People -> list of IDs
export const PeopleIdsFromPeople = S.transform(
  PeopleProp,
  S.Array(S.String),
  {
    strict: true,
    decode: (p) => p.people.map((u) => u.id),
    encode: (ids) => ({ people: ids.map((id) => ({ id })) }),
  }
);

// Relation -> list of IDs
export const RelationIdsFromRelation = S.transform(
  RelationProp,
  S.Array(S.String),
  {
    strict: true,
    decode: (p) => p.relation.map((r) => r.id),
    encode: (ids) => ({ relation: ids.map((id) => ({ id })) }),
  }
);

// Notion date <-> Date | undefined
export const DateFromNotionDate = S.transform(
  DateProp,
  S.Union(S.Date, S.Undefined),
  {
    strict: true,
    // Target encoded type for Date is string (ISO); return that here
    decode: (p) => (p.date ? p.date.start : undefined),
    encode: (iso) => ({ date: iso ? { start: iso } : null }),
  }
);

// Formula number -> number | undefined
export const NumberFromFormula = S.transform(
  FormulaNumberProp,
  S.Union(S.Number, S.Undefined),
  {
    strict: true,
    decode: (p) => p.formula.number ?? undefined,
    encode: (n) => ({ formula: { type: "number" as const, number: n ?? null } }),
  }
);

// Number -> number | undefined
export const NumberFromNumber = S.transform(
  NumberProp,
  S.Union(S.Number, S.Undefined),
  {
    strict: true,
    decode: (p) => p.number ?? undefined,
    encode: (n) => ({ number: n ?? null }),
  }
);

// Checkbox -> boolean
export const BooleanFromCheckbox = S.transform(
  CheckboxProp,
  S.Boolean,
  {
    strict: true,
    decode: (p) => p.checkbox,
    encode: (b) => ({ checkbox: b }),
  }
);

// Url -> string | undefined
export const UrlFromUrl = S.transform(
  UrlProp,
  S.Union(S.String, S.Undefined),
  {
    strict: true,
    decode: (p) => p.url ?? undefined,
    encode: (u) => ({ url: u ?? null }),
  }
);

// Email -> string | undefined
export const EmailFromEmail = S.transform(
  EmailProp,
  S.Union(S.String, S.Undefined),
  {
    strict: true,
    decode: (p) => p.email ?? undefined,
    encode: (e) => ({ email: e ?? null }),
  }
);

