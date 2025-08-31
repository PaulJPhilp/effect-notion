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

const P = {
  name: "Title", // title
  description: "Description", // rich_text
  type: "Content Type", // select
  tags: "Tags", // multi_select
  status: "Status", // select
  publishedAt: "Published Date", // date
};

export const blogArticleAdapter: EntityAdapter<BaseEntity> = {
  toNotionQuery: ({
    databaseId,
    params,
  }: {
    databaseId: string;
    params: ListParams;
  }) => {
    const and: any[] = [];

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

    const filter = and.length ? { and } : undefined;

    const sort =
      params.sort?.key === "name"
        ? { property: P.name, direction: params.sort.direction }
        : params.sort?.key === "publishedAt"
        ? { property: P.publishedAt, direction: params.sort.direction }
        : params.sort?.key === "updatedAt"
        ? { timestamp: "last_edited_time", direction: params.sort.direction }
        : {
            timestamp: "created_time",
            direction: params?.sort?.direction ?? "descending",
          };

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
    page: any;
  }) => {
    const props = page.properties as Record<string, any>;

    // --- Schema-driven subset mapping ---
    const shape = {
      name: S.String,
      description: S.optional(S.String),
      type: S.optional(S.String),
      tags: S.Array(S.String),
      status: S.optional(S.String),
      publishedAt: S.optional(S.Date),
    };

    const ann = defineDomainWithNotion(shape, {
      name: P.name,
      description: P.description,
      type: P.type,
      tags: P.tags,
      status: P.status,
      publishedAt: P.publishedAt,
    });

    // Local transforms for select and multi_select
    const SelectProp = S.Struct({
      select: S.Union(S.Null, S.Struct({ name: S.String })),
    });
    const SelectCodec = S.transform(
      SelectProp,
      S.Union(S.String, S.Undefined),
      {
        strict: true,
        decode: (p) => p.select?.name,
        encode: (s) => ({ select: s ? ({ name: s } as const) : null }),
      }
    );

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

    const codecs = {
      name: PlainTextFromTitle,
      description: PlainTextFromRichText,
      type: SelectCodec,
      tags: MultiSelectCodec,
      status: SelectCodec,
      publishedAt: DateFromNotionDate,
    } as const;

    const cfg = makeConfigFromAnnotations(ann, codecs);

    // Decode subset fields and aggregate non-fatal warnings
    const decoded: any = {};
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
          `blog.adapter.fromNotionPage decode failed: src=${source} page=${page.id} prop=${m.notionName} -> ${msg}`
        );
        warnings.push(`prop=${m.notionName}: ${msg}`);
      }
    }

    const entity = {
      id: `${source}_${page.id}`,
      source,
      pageId: page.id,
      databaseId,

      name: decoded.name,
      description: decoded.description,

      createdAt: new Date(page.created_time),
      updatedAt: new Date(page.last_edited_time),
      createdBy:
        page.created_by && typeof page.created_by === "object"
          ? (page.created_by as any).name ?? (page.created_by as any).id
          : undefined,
      updatedBy:
        page.last_edited_by && typeof page.last_edited_by === "object"
          ? (page.last_edited_by as any).name ?? (page.last_edited_by as any).id
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
    const props: Record<string, any> = {};

    // Recreate the same config used in fromNotionPage
    const shape = {
      name: S.String,
      description: S.optional(S.String),
      type: S.optional(S.String),
      tags: S.Array(S.String),
      status: S.optional(S.String),
      publishedAt: S.optional(S.Date),
    };

    const ann = defineDomainWithNotion(shape, {
      name: P.name,
      description: P.description,
      type: P.type,
      tags: P.tags,
      status: P.status,
      publishedAt: P.publishedAt,
    });

    const SelectProp = S.Struct({
      select: S.Union(S.Null, S.Struct({ name: S.String })),
    });
    const SelectCodec = S.transform(
      SelectProp,
      S.Union(S.String, S.Undefined),
      {
        strict: true,
        decode: (p) => p.select?.name,
        encode: (s) => ({ select: s ? ({ name: s } as const) : null }),
      }
    );

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

    const codecs = {
      name: PlainTextFromTitle,
      description: PlainTextFromRichText,
      type: SelectCodec,
      tags: MultiSelectCodec,
      status: SelectCodec,
      publishedAt: DateFromNotionDate,
    } as const;

    const cfg = makeConfigFromAnnotations(ann, codecs);

    // Encode only provided keys
    for (const [k, v] of Object.entries(patch)) {
      if (!(k in cfg)) continue;
      if (v === undefined) continue;
      const m = (cfg as any)[k];
      const res = S.encodeEither(m.codec)(v as any);
      if (Either.isRight(res)) props[m.notionName] = res.right;
    }

    return props;
  },
};
