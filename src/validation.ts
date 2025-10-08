// src/validation.ts
import type { NormalizedDatabaseSchema } from "./NotionSchema.js";
import type { ListArticlesRequest } from "./schema.js";

// Map of property type in schema to filter key expected in request
const typeToFilterKey: Record<string, string> = {
  title: "title",
  rich_text: "rich_text",
  select: "select",
  multi_select: "multi_select",
  status: "status",
  checkbox: "checkbox",
  number: "number",
  date: "date",
};

export const getPropertyTypeMap = (schema: NormalizedDatabaseSchema) => {
  const m = new Map<string, string>();
  for (const p of schema.properties) {
    m.set(p.name, p.type);
  }
  return m;
};

export const validateTitlePropertyName = (
  titlePropertyName: string | undefined,
  schema: NormalizedDatabaseSchema,
): string[] => {
  if (!titlePropertyName) {
    return [];
  }
  const known = schema.properties.some((p) => p.name === titlePropertyName);
  return known ? [] : [`Unknown titlePropertyName: ${titlePropertyName}`];
};

const collectFilterErrors = (
  node: unknown,
  typeMap: Map<string, string>,
  errors: string[],
  path = "filter",
) => {
  if (!node || typeof node !== "object") {
    return;
  }

  // Compound
  if (
    node &&
    typeof node === "object" &&
    "and" in node &&
    Array.isArray((node as { and: unknown[] }).and)
  ) {
    (node as { and: unknown[] }).and.forEach((child, i) =>
      collectFilterErrors(child, typeMap, errors, `${path}.and[${i}]`),
    );
  }
  if (
    node &&
    typeof node === "object" &&
    "or" in node &&
    Array.isArray((node as { or: unknown[] }).or)
  ) {
    (node as { or: unknown[] }).or.forEach((child, i) =>
      collectFilterErrors(child, typeMap, errors, `${path}.or[${i}]`),
    );
  }

  // Leaf
  if (
    node &&
    typeof node === "object" &&
    "property" in node &&
    typeof (node as { property: unknown }).property === "string"
  ) {
    const prop = (node as { property: string }).property;
    const schemaType = typeMap.get(prop);
    if (!schemaType) {
      errors.push(`Unknown filter property: ${prop} at ${path}`);
      return;
    }
    // Determine which leaf key is present
    const presentKeys = Object.keys(node).filter((k) => k !== "property");
    const leafKey = presentKeys.find((k) => k in typeToFilterKey);
    if (!leafKey) {
      return; // schema-level already validated shapes
    }

    const expectedKey = typeToFilterKey[schemaType];
    if (leafKey !== expectedKey) {
      errors.push(
        `Invalid operator group '${leafKey}' for property '${prop}' (type ` +
          `'${schemaType}'). Expected '${expectedKey}'. at ${path}`,
      );
    }
  }
};

export const validateFilterAgainstSchema = (
  filter: unknown,
  schema: NormalizedDatabaseSchema,
): string[] => {
  if (!filter) {
    return [];
  }
  const typeMap = getPropertyTypeMap(schema);
  const errors: string[] = [];
  collectFilterErrors(filter, typeMap, errors);
  return errors;
};

export const validateSortsAgainstSchema = (
  sorts: ReadonlyArray<{ property: string; direction?: string }> | undefined,
  schema: NormalizedDatabaseSchema,
): string[] => {
  if (!sorts || sorts.length === 0) {
    return [];
  }
  const known = new Set(schema.properties.map((p) => p.name));
  const errors: string[] = [];
  sorts.forEach((s, i) => {
    if (!known.has(s.property)) {
      errors.push(
        `Unknown sort property: ${s.property} at sorts[${i}].property`,
      );
    }
    const dir = s.direction;
    if (dir !== "ascending" && dir !== "descending") {
      errors.push(
        `Invalid sort direction: ${String(dir)} at sorts[${i}].direction`,
      );
    }
  });
  return errors;
};

export const validateListArticlesRequestAgainstSchema = (
  body: ListArticlesRequest,
  schema: NormalizedDatabaseSchema,
): string[] => {
  return [
    ...validateTitlePropertyName(body.titlePropertyName, schema),
    ...validateFilterAgainstSchema(body.filter, schema),
    ...validateSortsAgainstSchema(body.sorts, schema),
  ];
};
