// src/NotionAccessors.ts
import { Option } from "effect";
import type { NormalizedDatabaseSchema } from "./NotionSchema.js";
import type { PageListResponse } from "./NotionSchema.js";

// Define the Page type based on the schema
export type Page = PageListResponse["results"][number];

// Define a type for Notion property values
export type NotionProperty = {
  title?: ReadonlyArray<{ plain_text: string }>;
  select?: { name?: string } | null;
  date?: { start: string; end: string | null; time_zone?: string } | null;
  number?: number | null;
  multi_select?: ReadonlyArray<{ name?: string }> | null;
  checkbox?: boolean | null;
  url?: string | null;
  status?: { name?: string } | null;
  people?: ReadonlyArray<{ id: string }> | null;
  relation?: ReadonlyArray<{ id: string }> | null;
  files?: ReadonlyArray<{ file?: { url?: string }; external?: { url?: string } }> | null;
  formula?: { type?: string; string?: string | null; number?: number | null; boolean?: boolean | null; date?: { start: string; end: string | null } | null } | null;
  rollup?: { type?: string; number?: number | null; date?: { start: string; end: string | null } | null; array?: ReadonlyArray<unknown> | null } | null;
} & Record<string, unknown>;

export const hasTitleArray = (
  prop: unknown,
): prop is { title: ReadonlyArray<{ plain_text: string }> } =>
  !!prop && typeof prop === "object" &&
  "title" in prop && Array.isArray((prop as Record<string, unknown>).title);

export const hasRichTextArray = (
  prop: unknown,
): prop is { rich_text: ReadonlyArray<{ plain_text: string }> } =>
  !!prop && typeof prop === "object" &&
  "rich_text" in prop && Array.isArray((prop as Record<string, unknown>).rich_text);

export const getRichText = (
  page: Page,
  propertyName: string,
): string | null => {
  const prop = page.properties[propertyName];
  if (!prop || typeof prop !== "object") return null;

  if (hasTitleArray(prop)) {
    return prop.title.map((t) => t.plain_text).join("");
  }
  
  if (hasRichTextArray(prop)) {
    return prop.rich_text.map((t) => t.plain_text).join("");
  }

  return null;
};

export const getRichTextOpt = (
  page: Page,
  propertyName: string,
): Option.Option<string> => {
  const v = getRichText(page, propertyName);
  return v == null ? Option.none() : Option.some(v);
};

export const getSelect = (
  page: Page,
  propertyName: string,
): string | null => {
  const p = page?.properties?.[propertyName];
  if (!p || typeof p !== "object") return null;
  const sel = (p as NotionProperty)?.select as { name?: string } | null | undefined;
  return sel?.name ?? null;
};

export const getSelectOpt = (
  page: Page,
  propertyName: string,
): Option.Option<string> => {
  const v = getSelect(page, propertyName);
  return v == null ? Option.none() : Option.some(v);
};

export const getDate = (
  page: Page,
  propertyName: string,
): { start: string; end: string | null; timezone?: string } | null => {
  const p = page?.properties?.[propertyName];
  if (!p || typeof p !== "object") return null;
  const d = (p as NotionProperty)?.date as
    | { start: string; end: string | null; time_zone?: string }
    | null
    | undefined;
  if (!d) return null;
  return { start: d.start, end: d.end ?? null, timezone: d.time_zone };
};

export const getDateOpt = (
  page: Page,
  propertyName: string,
): Option.Option<{ start: string; end: string | null; timezone?: string }> => {
  const v = getDate(page, propertyName);
  return v == null ? Option.none() : Option.some(v);
};

export const getNumber = (
  page: Page,
  propertyName: string,
): number | null => {
  const p = page?.properties?.[propertyName];
  if (!p || typeof p !== "object") return null;
  const n = (p as NotionProperty)?.number as number | null | undefined;
  return typeof n === "number" ? n : null;
};

export const getNumberOpt = (
  page: Page,
  propertyName: string,
): Option.Option<number> => {
  const v = getNumber(page, propertyName);
  return v == null ? Option.none() : Option.some(v);
};

export const getMultiSelect = (
  page: Page,
  propertyName: string,
): ReadonlyArray<string> | null => {
  const p = page?.properties?.[propertyName];
  if (!p || typeof p !== "object") return null;
  const arr = (p as NotionProperty)?.multi_select as
    | ReadonlyArray<{ name?: string }>
    | null
    | undefined;
  if (!arr || arr.length === 0) return null;
  return arr.map((o) => o?.name).filter(Boolean) as ReadonlyArray<string>;
};

export const getMultiSelectOpt = (
  page: Page,
  propertyName: string,
): Option.Option<ReadonlyArray<string>> => {
  const v = getMultiSelect(page, propertyName);
  return v == null ? Option.none() : Option.some(v);
};

export const getCheckbox = (
  page: Page,
  propertyName: string,
): boolean | null => {
  const p = page?.properties?.[propertyName];
  if (!p || typeof p !== "object") return null;
  const b = (p as NotionProperty)?.checkbox as boolean | null | undefined;
  return typeof b === "boolean" ? b : null;
};

export const getCheckboxOpt = (
  page: Page,
  propertyName: string,
): Option.Option<boolean> => {
  const v = getCheckbox(page, propertyName);
  return v == null ? Option.none() : Option.some(v);
};

export const getUrl = (
  page: Page,
  propertyName: string,
): string | null => {
  const p = page?.properties?.[propertyName];
  if (!p || typeof p !== "object") return null;
  const u = (p as NotionProperty)?.url as string | null | undefined;
  return typeof u === "string" && u.length > 0 ? u : null;
};

export const getUrlOpt = (
  page: Page,
  propertyName: string,
): Option.Option<string> => {
  const v = getUrl(page, propertyName);
  return v == null ? Option.none() : Option.some(v);
};

export const getStatus = (
  page: Page,
  propertyName: string,
): string | null => {
  const p = page?.properties?.[propertyName];
  if (!p || typeof p !== "object") return null;
  const s = (p as NotionProperty)?.status as { name?: string } | null | undefined;
  return s?.name ?? null;
};

export const getStatusOpt = (
  page: Page,
  propertyName: string,
): Option.Option<string> => {
  const v = getStatus(page, propertyName);
  return v == null ? Option.none() : Option.some(v);
};

export const getPeopleIds = (
  page: Page,
  propertyName: string,
): ReadonlyArray<string> | null => {
  const p = page?.properties?.[propertyName];
  if (!p || typeof p !== "object") return null;
  const arr = (p as NotionProperty)?.people as ReadonlyArray<{ id: string }> | null | undefined;
  if (!arr || arr.length === 0) return null;
  return arr.map((x) => x.id);
};

export const getPeopleIdsOpt = (
  page: Page,
  propertyName: string,
): Option.Option<ReadonlyArray<string>> => {
  const v = getPeopleIds(page, propertyName);
  return v == null ? Option.none() : Option.some(v);
};

export const getRelationIds = (
  page: Page,
  propertyName: string,
): ReadonlyArray<string> | null => {
  const p = page?.properties?.[propertyName];
  if (!p || typeof p !== "object") return null;
  const arr = (p as NotionProperty)?.relation as ReadonlyArray<{ id: string }> | null | undefined;
  if (!arr || arr.length === 0) return null;
  return arr.map((x) => x.id);
};

export const getRelationIdsOpt = (
  page: Page,
  propertyName: string,
): Option.Option<ReadonlyArray<string>> => {
  const v = getRelationIds(page, propertyName);
  return v == null ? Option.none() : Option.some(v);
};

export const getFileUrls = (
  page: Page,
  propertyName: string,
): ReadonlyArray<string> | null => {
  const p = page?.properties?.[propertyName];
  if (!p || typeof p !== "object") return null;
  
  // Type guard to check if object has file property
  const hasFile = (obj: any): obj is { file?: { url?: string } } => 
    obj && typeof obj === "object" && "file" in obj;
  
  // Type guard to check if object has external property
  const hasExternal = (obj: any): obj is { external?: { url?: string } } => 
    obj && typeof obj === "object" && "external" in obj;

  const arr = (p as NotionProperty)?.files as
    | ReadonlyArray<
        | { file?: { url?: string } }
        | { external?: { url?: string } }
      >
    | null
    | undefined;
  if (!arr || arr.length === 0) return null;
  const urls = arr
    .map((f) => {
      if (hasFile(f)) {
        return f.file?.url;
      } else if (hasExternal(f)) {
        return f.external?.url;
      }
      return undefined;
    })
    .filter((u): u is string => typeof u === "string" && u.length > 0);
  return urls.length > 0 ? (urls as ReadonlyArray<string>) : null;
};

export const getFileUrlsOpt = (
  page: Page,
  propertyName: string,
): Option.Option<ReadonlyArray<string>> => {
  const v = getFileUrls(page, propertyName);
  return v == null ? Option.none() : Option.some(v);
};

export type FormulaValue =
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "date"; value: { start: string; end: string | null } }
  | { kind: "boolean"; value: boolean };

export const getFormula = (
  page: Page,
  propertyName: string,
): FormulaValue | null => {
  const p = page?.properties?.[propertyName];
  if (!p || typeof p !== "object") return null;
  const f = (p as NotionProperty)?.formula as
    | {
        type?: string;
        string?: string | null;
        number?: number | null;
        boolean?: boolean | null;
        date?: { start: string; end: string | null } | null;
      }
    | null
    | undefined;
  if (!f || typeof f.type !== "string") return null;
  switch (f.type) {
    case "string":
      return f.string != null
        ? { kind: "string", value: f.string }
        : null;
    case "number":
      return typeof f.number === "number"
        ? { kind: "number", value: f.number }
        : null;
    case "date":
      return f.date != null
        ? { kind: "date", value: { start: f.date.start, end: f.date.end } }
        : null;
    case "boolean":
      return typeof f.boolean === "boolean"
        ? { kind: "boolean", value: f.boolean }
        : null;
    default:
      return null;
  }
};

export const getFormulaOpt = (
  page: Page,
  propertyName: string,
): Option.Option<FormulaValue> => {
  const v = getFormula(page, propertyName);
  return v == null ? Option.none() : Option.some(v);
};

export type RollupValue =
  | { kind: "number"; value: number }
  | { kind: "date"; value: { start: string; end: string | null } }
  | { kind: "array"; value: ReadonlyArray<unknown> };

export const getRollup = (
  page: Page,
  propertyName: string,
): RollupValue | null => {
  const p = page?.properties?.[propertyName];
  if (!p || typeof p !== "object") return null;
  const r = (p as NotionProperty)?.rollup as
    | {
        type?: string;
        number?: number | null;
        date?: { start: string; end: string | null } | null;
        array?: ReadonlyArray<unknown> | null;
      }
    | null
    | undefined;
  if (!r || typeof r.type !== "string") return null;
  switch (r.type) {
    case "number":
      return typeof r.number === "number"
        ? { kind: "number", value: r.number }
        : null;
    case "date":
      return r.date != null
        ? { kind: "date", value: { start: r.date.start, end: r.date.end } }
        : null;
    case "array":
      return Array.isArray(r.array)
        ? { kind: "array", value: r.array }
        : null;
    default:
      return null;
  }
};

export const getRollupOpt = (
  page: Page,
  propertyName: string,
): Option.Option<RollupValue> => {
  const v = getRollup(page, propertyName);
  return v == null ? Option.none() : Option.some(v);
};

export type PropertyValue =
  | { type: "title"; value: string }
  | { type: "rich_text"; value: string | null }
  | { type: "select"; value: string | null }
  | { type: "multi_select"; value: ReadonlyArray<string> | null }
  | {
      type: "date";
      value: { start: string; end: string | null; timezone?: string } | null;
    }
  | { type: "number"; value: number | null }
  | { type: "checkbox"; value: boolean | null }
  | { type: "url"; value: string | null }
  | { type: "status"; value: string | null }
  | { type: "people"; value: ReadonlyArray<string> | null }
  | { type: "relation"; value: ReadonlyArray<string> | null }
  | { type: "files"; value: ReadonlyArray<string> | null }
  | { type: "formula"; value: FormulaValue | null }
  | { type: "rollup"; value: RollupValue | null }
  | { type: string; value: NotionProperty };

export const getPropertyFromPage = (
  page: Page,
  schema: NormalizedDatabaseSchema,
  propertyName: string,
): PropertyValue => {
  const propSchema = schema.properties.find((p) => p.name === propertyName);
  if (!propSchema) {
    throw new Error(`Property ${propertyName} not found in schema`);
  }

  const t = propSchema.type;
  switch (t) {
    case "title": {
      const p = page?.properties?.[propertyName];
      const v = hasTitleArray(p) && p.title[0]
        ? p.title[0].plain_text
        : "Untitled";
      return { type: "title", value: v };
    }
    case "rich_text": {
      const v = getRichTextOpt(page, propertyName);
      return { type: "rich_text", value: Option.getOrElse(v, () => null) };
    }
    case "select":
      return { type: "select", value: getSelect(page, propertyName) };
    case "multi_select":
      return {
        type: "multi_select",
        value: getMultiSelect(page, propertyName),
      };
    case "date":
      return { type: "date", value: getDate(page, propertyName) };
    case "number":
      return { type: "number", value: getNumber(page, propertyName) };
    case "checkbox":
      return { type: "checkbox", value: getCheckbox(page, propertyName) };
    case "url":
      return { type: "url", value: getUrl(page, propertyName) };
    case "status":
      return { type: "status", value: getStatus(page, propertyName) };
    case "people":
      return { type: "people", value: getPeopleIds(page, propertyName) };
    case "relation":
      return { type: "relation", value: getRelationIds(page, propertyName) };
    case "files":
      return { type: "files", value: getFileUrls(page, propertyName) };
    case "formula":
      return { type: "formula", value: getFormula(page, propertyName) };
    case "rollup":
      return { type: "rollup", value: getRollup(page, propertyName) };
    default:
      return { type: t, value: page?.properties?.[propertyName] as NotionProperty };
  }
};

export const getTitleFromPage = (
  page: Page,
  schema: NormalizedDatabaseSchema,
  overrideTitleName?: string,
): string => {
  const name = schema.titlePropertyName ?? overrideTitleName;
  if (!name) return "Untitled";
  const p = page?.properties?.[name];
  if (hasTitleArray(p) && p.title[0]) return p.title[0].plain_text;
  if (hasRichTextArray(p) && p.rich_text[0]) return p.rich_text.map((t) => t.plain_text).join("");
  return "Untitled";
};
