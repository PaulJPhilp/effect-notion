import { Either } from "effect";
import * as S from "effect/Schema";
import type { EntityAdapter } from "../../adapters/Adapter.js";
import type { BaseEntity, ListParams } from "../../logical/Common.js";
import { formatParseError } from "../schema/Errors.js";
import { logWarn } from "../schema/Logger.js";
import {
  DateFromNotionDate,
  PlainTextFromRichText,
  PlainTextFromTitle,
  defineDomainWithNotion,
  makeConfigFromAnnotations,
} from "../schema/index.js";

/**
 * Notion property name mappings for blog articles.
 */
const P = {
  name: "Title", // title
  description: "Description", // rich_text
  type: "Content Type", // select
  tags: "Tags", // multi_select
  status: "Status", // select
  publishedAt: "Published Date", // date
};

/**
 * Shared schema configuration for blog article adapter.
 * Defines the mapping between domain fields and Notion properties.
 *
 * This configuration is used by both fromNotionPage (decode) and
 * toNotionProperties (encode) to ensure consistency.
 */
const buildBlogSchemaConfig = () => {
  // Domain shape definition
  const shape = {
    name: S.String,
    description: S.optional(S.String),
    type: S.optional(S.String),
    tags: S.Array(S.String),
    status: S.optional(S.String),
    publishedAt: S.optional(S.Date),
  };

  // Notion property annotations
  const ann = defineDomainWithNotion(shape, {
    name: P.name,
    description: P.description,
    type: P.type,
    tags: P.tags,
    status: P.status,
    publishedAt: P.publishedAt,
  });

  // Notion select property codec
  const SelectProp = S.Struct({
    select: S.Union(S.Null, S.Struct({ name: S.String })),
  });
  const SelectCodec = S.transform(SelectProp, S.Union(S.String, S.Undefined), {
    strict: true,
    decode: (p) => p.select?.name,
    encode: (s) => ({ select: s ? ({ name: s } as const) : null }),
  });

  // Notion multi_select property codec
  const MultiSelectProp = S.Struct({
    multi_select: S.Array(S.Struct({ name: S.String })),
  });
  const MultiSelectCodec = S.transform(MultiSelectProp, S.Array(S.String), {
    strict: true,
    decode: (p) => p.multi_select.map((o) => o.name),
    encode: (arr) => ({
      multi_select: arr.map((name) => ({ name } as const)) as readonly {
        readonly name: string;
      }[],
    }),
  });

  // Field-specific codecs
  const codecs = {
    name: PlainTextFromTitle,
    description: PlainTextFromRichText,
    type: SelectCodec,
    tags: MultiSelectCodec,
    status: SelectCodec,
    publishedAt: DateFromNotionDate,
  } as const;

  // biome-ignore lint/suspicious/noExplicitAny: heterogeneous codec types require type bridge
  return makeConfigFromAnnotations(ann, codecs as any);
};

function buildFilter(params: ListParams) {
  const and: unknown[] = [];

  if (params.filter?.statusEquals) {
    and.push({
      property: P.status,
      select: { equals: params.filter.statusEquals },
    });
  }
  if (params.filter?.typeEquals) {
    and.push({
      property: P.type,
      select: { equals: params.filter.typeEquals },
    });
  }
  if (params.filter?.tagIn && params.filter.tagIn.length > 0) {
    and.push(
      ...params.filter.tagIn.map((t: string) => ({
        property: P.tags,
        multi_select: { contains: t },
      }))
    );
  }
  if (params.filter?.publishedAfter) {
    and.push({
      property: P.publishedAt,
      date: { on_or_after: params.filter.publishedAfter.toISOString() },
    });
  }
  if (params.filter?.publishedBefore) {
    and.push({
      property: P.publishedAt,
      date: { on_or_before: params.filter.publishedBefore.toISOString() },
    });
  }

  return and.length ? { and } : undefined;
}

function buildSort(params: ListParams) {
  if (params.sort?.key === "name") {
    return { property: P.name, direction: params.sort.direction };
  }
  if (params.sort?.key === "publishedAt") {
    return { property: P.publishedAt, direction: params.sort.direction };
  }
  if (params.sort?.key === "updatedAt") {
    return {
      timestamp: "last_edited_time",
      direction: params.sort.direction,
    };
  }
  return {
    timestamp: "created_time",
    direction: params?.sort?.direction ?? "descending",
  };
}

export const blogArticleAdapter: EntityAdapter<BaseEntity> = {
  toNotionQuery: ({
    databaseId,
    params,
  }: {
    databaseId: string;
    params: ListParams;
  }) => {
    const filter = buildFilter(params);
    const sort = buildSort(params);

    return {
      ...(filter !== undefined ? { filter } : {}),
      sorts: [sort],
      page_size: params.pageSize ?? 20,
      ...(params.startCursor !== undefined
        ? { start_cursor: params.startCursor }
        : {}),
    };
  },

  fromNotionPage: ({
    source,
    databaseId,
    page,
  }: {
    source: string;
    databaseId: string;
    page: unknown;
  }) => {
    const pageTyped = page as {
      id: string;
      properties: Record<string, unknown>;
      created_time: string;
      last_edited_time: string;
      created_by?: { name?: string; id?: string };
      last_edited_by?: { name?: string; id?: string };
    };

    const props = pageTyped.properties;

    // Use shared schema configuration
    const cfg = buildBlogSchemaConfig();

    // Decode subset fields and aggregate non-fatal warnings
    const decoded: Record<string, unknown> = {};
    const warnings: Array<string> = [];
    for (const [k, m] of Object.entries(cfg)) {
      const res = S.decodeEither(m.codec)(props[m.notionName]);
      if (Either.isRight(res)) {
        decoded[k] = res.right;
      } else {
        // Best-effort logging; adapter runs outside Effect context
        const msg = formatParseError(res.left);
        // Include source, pageId, property name for diagnostics
        logWarn(
          `blog.adapter.fromNotionPage decode failed: src=${source} page=${pageTyped.id} prop=${m.notionName} -> ${msg}`
        );
        warnings.push(`prop=${m.notionName}: ${msg}`);
      }
    }

    const entity = {
      id: `${source}_${pageTyped.id}`,
      source,
      pageId: pageTyped.id,
      databaseId,

      name: decoded.name,
      description: decoded.description,

      createdAt: new Date(pageTyped.created_time),
      updatedAt: new Date(pageTyped.last_edited_time),
      createdBy:
        pageTyped.created_by && typeof pageTyped.created_by === "object"
          ? pageTyped.created_by?.name ?? pageTyped.created_by?.id
          : undefined,
      updatedBy:
        pageTyped.last_edited_by && typeof pageTyped.last_edited_by === "object"
          ? pageTyped.last_edited_by?.name ?? pageTyped.last_edited_by?.id
          : undefined,

      type: decoded.type,
      tags: decoded.tags ?? [],
      status: decoded.status,
      publishedAt: decoded.publishedAt,
    } as BaseEntity & { warnings?: ReadonlyArray<string> };

    if (warnings.length > 0) {
      entity.warnings = warnings;
    }

    return entity;
  },

  toNotionProperties: ({ patch }: { patch: Partial<BaseEntity> }) => {
    const props: Record<string, unknown> = {};

    // Use shared schema configuration
    const cfg = buildBlogSchemaConfig();

    // Encode only provided keys
    for (const [k, v] of Object.entries(patch)) {
      if (!(k in cfg)) {
        continue;
      }
      if (v === undefined) {
        continue;
      }
      const m = (cfg as Record<string, { notionName: string; codec: S.Schema<unknown, unknown> }>)[k]
      if (!m) { continue }
      const res = S.encodeEither(m.codec)(v)
      if (Either.isRight(res)) {
        props[m.notionName] = res.right
      }
    }

    return props;
  },
};
