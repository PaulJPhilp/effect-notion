import { describe, it, expect } from "vitest";
import * as S from "effect/Schema";
import { Either } from "effect";
import {
  TitleProp,
  RichTextProp,
  FilesProp,
  PeopleProp,
  RelationProp,
  DateProp,
  FormulaNumberProp,
  PlainTextFromTitle,
  PlainTextFromRichText,
  UrlListFromFiles,
  FirstUrlFromFiles,
  PeopleIdsFromPeople,
  RelationIdsFromRelation,
  DateFromNotionDate,
  NumberFromFormula,
  NumberFromNumber,
  BooleanFromCheckbox,
  UrlFromUrl,
  EmailFromEmail,
} from "../src/domain/adapters/schema/index";

describe("Helper codecs", () => {
  it("PlainTextFromTitle round-trip", () => {
    const decoded = S.decodeEither(PlainTextFromTitle)({
      title: [{ type: "text", text: { content: "Hello" } }],
    });
    expect(Either.isRight(decoded)).toBe(true);
    if (Either.isRight(decoded)) expect(decoded.right).toBe("Hello");

    const encoded = S.encodeEither(PlainTextFromTitle)("World");
    expect(Either.isRight(encoded)).toBe(true);
    if (Either.isRight(encoded))
      expect(encoded.right.title[0].text.content).toBe("World");
  });

  it("PlainTextFromRichText round-trip", () => {
    const decoded = S.decodeEither(PlainTextFromRichText)({
      rich_text: [{ type: "text", text: { content: "A" } }],
    });
    expect(Either.isRight(decoded)).toBe(true);
    if (Either.isRight(decoded)) expect(decoded.right).toBe("A");

    const encoded = S.encodeEither(PlainTextFromRichText)("B");
    expect(Either.isRight(encoded)).toBe(true);
    if (Either.isRight(encoded))
      expect(encoded.right.rich_text[0].text.content).toBe("B");
  });

  it("UrlListFromFiles decodes list and encodes list", () => {
    const decoded = S.decodeEither(UrlListFromFiles)({
      files: [
        { name: "f1", url: "https://a" },
        { name: "f2", url: "https://b" },
      ],
    });
    expect(Either.isRight(decoded)).toBe(true);
    if (Either.isRight(decoded))
      expect(decoded.right).toEqual(["https://a", "https://b"]);

    const encoded = S.encodeEither(UrlListFromFiles)(["https://x"]);
    expect(Either.isRight(encoded)).toBe(true);
    if (Either.isRight(encoded))
      expect(encoded.right.files[0].url).toBe("https://x");
  });

  it("FirstUrlFromFiles handles undefined and present values", () => {
    const d1 = S.decodeEither(FirstUrlFromFiles)({ files: [] });
    expect(Either.isRight(d1)).toBe(true);
    if (Either.isRight(d1)) expect(d1.right).toBeUndefined();

    const d2 = S.decodeEither(FirstUrlFromFiles)({
      files: [{ name: "f1", url: "https://z" }],
    });
    expect(Either.isRight(d2)).toBe(true);
    if (Either.isRight(d2)) expect(d2.right).toBe("https://z");

    const e1 = S.encodeEither(FirstUrlFromFiles)(undefined);
    expect(Either.isRight(e1)).toBe(true);
    if (Either.isRight(e1)) expect(e1.right.files.length).toBe(0);

    const e2 = S.encodeEither(FirstUrlFromFiles)("https://w");
    expect(Either.isRight(e2)).toBe(true);
    if (Either.isRight(e2)) expect(e2.right.files[0].url).toBe("https://w");
  });

  it("PeopleIdsFromPeople round-trip", () => {
    const d = S.decodeEither(PeopleIdsFromPeople)({
      people: [{ id: "u1" }, { id: "u2" }],
    });
    expect(Either.isRight(d)).toBe(true);
    if (Either.isRight(d)) expect(d.right).toEqual(["u1", "u2"]);

    const e = S.encodeEither(PeopleIdsFromPeople)(["a1"]);
    expect(Either.isRight(e)).toBe(true);
    if (Either.isRight(e)) expect(e.right.people[0].id).toBe("a1");
  });

  it("RelationIdsFromRelation round-trip", () => {
    const d = S.decodeEither(RelationIdsFromRelation)({
      relation: [{ id: "p1" }, { id: "p2" }],
    });
    expect(Either.isRight(d)).toBe(true);
    if (Either.isRight(d)) expect(d.right).toEqual(["p1", "p2"]);

    const e = S.encodeEither(RelationIdsFromRelation)(["z1"]);
    expect(Either.isRight(e)).toBe(true);
    if (Either.isRight(e)) expect(e.right.relation[0].id).toBe("z1");
  });

  it("DateFromNotionDate handles undefined and date", () => {
    const d1 = S.decodeEither(DateFromNotionDate)({ date: null });
    expect(Either.isRight(d1)).toBe(true);
    if (Either.isRight(d1)) expect(d1.right).toBeUndefined();

    const d2 = S.decodeEither(DateFromNotionDate)({
      date: { start: "2020-01-02T03:04:05.000Z" },
    });
    expect(Either.isRight(d2)).toBe(true);
    if (Either.isRight(d2)) expect(d2.right instanceof Date).toBe(true);

    const e1 = S.encodeEither(DateFromNotionDate)(undefined);
    expect(Either.isRight(e1)).toBe(true);
    if (Either.isRight(e1)) expect(e1.right.date).toBeNull();

    const e2 = S.encodeEither(DateFromNotionDate)(
      new Date("2021-05-06T07:08:09.000Z")
    );
    expect(Either.isRight(e2)).toBe(true);
    if (Either.isRight(e2))
      expect(e2.right.date?.start).toBe("2021-05-06T07:08:09.000Z");
  });

  it("NumberFromFormula handles number and undefined", () => {
    const d1 = S.decodeEither(NumberFromFormula)({
      formula: { type: "number", number: null },
    });
    expect(Either.isRight(d1)).toBe(true);
    if (Either.isRight(d1)) expect(d1.right).toBeUndefined();

    const d2 = S.decodeEither(NumberFromFormula)({
      formula: { type: "number", number: 7 },
    });
    expect(Either.isRight(d2)).toBe(true);
    if (Either.isRight(d2)) expect(d2.right).toBe(7);

    const e1 = S.encodeEither(NumberFromFormula)(undefined);
    expect(Either.isRight(e1)).toBe(true);
    if (Either.isRight(e1))
      expect(e1.right.formula).toEqual({ type: "number", number: null });

    const e2 = S.encodeEither(NumberFromFormula)(9);
    expect(Either.isRight(e2)).toBe(true);
    if (Either.isRight(e2))
      expect(e2.right.formula).toEqual({ type: "number", number: 9 });
  });

  it("NumberFromNumber handles number and undefined", () => {
    const d1 = S.decodeEither(NumberFromNumber)({ number: null });
    expect(Either.isRight(d1)).toBe(true);
    if (Either.isRight(d1)) expect(d1.right).toBeUndefined();

    const d2 = S.decodeEither(NumberFromNumber)({ number: 42 });
    expect(Either.isRight(d2)).toBe(true);
    if (Either.isRight(d2)) expect(d2.right).toBe(42);

    const e1 = S.encodeEither(NumberFromNumber)(undefined);
    expect(Either.isRight(e1)).toBe(true);
    if (Either.isRight(e1)) expect(e1.right).toEqual({ number: null });

    const e2 = S.encodeEither(NumberFromNumber)(7);
    expect(Either.isRight(e2)).toBe(true);
    if (Either.isRight(e2)) expect(e2.right).toEqual({ number: 7 });
  });

  it("BooleanFromCheckbox round-trip", () => {
    const d = S.decodeEither(BooleanFromCheckbox)({ checkbox: true });
    expect(Either.isRight(d)).toBe(true);
    if (Either.isRight(d)) expect(d.right).toBe(true);

    const e = S.encodeEither(BooleanFromCheckbox)(false);
    expect(Either.isRight(e)).toBe(true);
    if (Either.isRight(e)) expect(e.right).toEqual({ checkbox: false });
  });

  it("UrlFromUrl handles string and undefined", () => {
    const d1 = S.decodeEither(UrlFromUrl)({ url: null });
    expect(Either.isRight(d1)).toBe(true);
    if (Either.isRight(d1)) expect(d1.right).toBeUndefined();

    const d2 = S.decodeEither(UrlFromUrl)({ url: "https://a" });
    expect(Either.isRight(d2)).toBe(true);
    if (Either.isRight(d2)) expect(d2.right).toBe("https://a");

    const e1 = S.encodeEither(UrlFromUrl)(undefined);
    expect(Either.isRight(e1)).toBe(true);
    if (Either.isRight(e1)) expect(e1.right).toEqual({ url: null });

    const e2 = S.encodeEither(UrlFromUrl)("https://b");
    expect(Either.isRight(e2)).toBe(true);
    if (Either.isRight(e2)) expect(e2.right).toEqual({ url: "https://b" });
  });

  it("EmailFromEmail handles string and undefined", () => {
    const d1 = S.decodeEither(EmailFromEmail)({ email: null });
    expect(Either.isRight(d1)).toBe(true);
    if (Either.isRight(d1)) expect(d1.right).toBeUndefined();

    const d2 = S.decodeEither(EmailFromEmail)({ email: "a@b.com" });
    expect(Either.isRight(d2)).toBe(true);
    if (Either.isRight(d2)) expect(d2.right).toBe("a@b.com");

    const e1 = S.encodeEither(EmailFromEmail)(undefined);
    expect(Either.isRight(e1)).toBe(true);
    if (Either.isRight(e1)) expect(e1.right).toEqual({ email: null });

    const e2 = S.encodeEither(EmailFromEmail)("c@d.com");
    expect(Either.isRight(e2)).toBe(true);
    if (Either.isRight(e2)) expect(e2.right).toEqual({ email: "c@d.com" });
  });
});
