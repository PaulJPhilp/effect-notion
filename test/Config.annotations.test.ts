import { describe, it, expect } from "vitest";
import * as S from "effect/Schema";
import { Either } from "effect";
import {
  PlainTextFromTitle,
  PlainTextFromRichText,
  UrlListFromFiles,
  PeopleIdsFromPeople,
  RelationIdsFromRelation,
  DateFromNotionDate,
  NumberFromFormula,
  defineDomainWithNotion,
  makeConfigFromAnnotations,
  type FieldCodec,
} from "../src/domain/adapters/schema/index";

// Keep lines <= 80 chars per user preference

describe("Config annotations -> auto config", () => {
  it("generates a StrongConfig from domain annotations", () => {
    // 1) Define a minimal domain Struct with annotations
    const shape = {
      id: S.String,
      title: S.String,
      slug: S.String,
      publishedAt: S.optional(S.Date),
      authors: S.Array(S.String),
      attachments: S.Array(S.String),
      relatedIds: S.Array(S.String),
      score: S.optional(S.Number),
    };

    const ann = defineDomainWithNotion(shape, {
      id: "Id",
      title: "Title",
      slug: "Slug",
      publishedAt: "Published At",
      authors: "Authors",
      attachments: "Attachments",
      relatedIds: "Related",
      score: "Score",
    });

    // 2) Provide a matching codec map
    const codecs = {
      id: PlainTextFromRichText,
      title: PlainTextFromTitle,
      slug: PlainTextFromRichText,
      publishedAt: DateFromNotionDate,
      authors: PeopleIdsFromPeople,
      attachments: UrlListFromFiles,
      relatedIds: RelationIdsFromRelation,
      score: NumberFromFormula,
    } as const;

    // 3) Build config
    const cfg = makeConfigFromAnnotations(ann, codecs);

    // 4) Assertions: names and identity of codec instances
    expect(cfg.title.notionName).toBe("Title");
    expect(cfg.slug.notionName).toBe("Slug");
    expect(cfg.attachments.notionName).toBe("Attachments");

    // reference equality check (helpers are values)
    expect(cfg.title.codec).toBe(PlainTextFromTitle);
    expect(cfg.id.codec).toBe(PlainTextFromRichText);
    expect(cfg.publishedAt.codec).toBe(DateFromNotionDate);

    // 5) Quick smoke of a decode via the produced cfg entry
    const titleDecoded = S.decodeEither(cfg.title.codec)({
      title: [{ type: "text", text: { content: "X" } }],
    });
    expect(Either.isRight(titleDecoded)).toBe(true);
    if (Either.isRight(titleDecoded)) expect(titleDecoded.right).toBe("X");
  });
});
