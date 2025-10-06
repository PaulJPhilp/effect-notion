import { describe, it, expect } from "vitest";
import * as S from "effect/Schema";
import { Either } from "effect";
import {
  formatParseError,
  prettyDecode,
  prettyEncode,
} from "../src/domain/adapters/schema/Errors";

describe("Schema error pretty-printing", () => {
  it("prettyDecode returns Left<string> with readable message", () => {
    const schema = S.Struct({
      name: S.String,
      tags: S.Array(S.String),
    });

    const bad = { name: 123, tags: ["ok", 42] } as any;
    const res = prettyDecode(schema)(bad);

    expect(Either.isLeft(res)).toBe(true);
    if (Either.isLeft(res)) {
      const msg = res.left;
      expect(typeof msg).toBe("string");
      // Heuristic checks; avoid pinning to exact formatter text
      expect(msg).toContain("name");
      expect(msg.toLowerCase()).toContain("string");
      expect(msg).toContain("tags");
    }
  });

  it("prettyEncode returns Left<string> with readable message", () => {
    const schema = S.String;
    const res = prettyEncode(schema)(123 as any);

    expect(Either.isLeft(res)).toBe(true);
    if (Either.isLeft(res)) {
      const msg = res.left;
      expect(typeof msg).toBe("string");
      expect(msg.toLowerCase()).toContain("string");
    }
  });

  it("formatParseError falls back to JSON for non-parse errors", () => {
    const msg = formatParseError(new Error("boom"));
    expect(typeof msg).toBe("string");
    expect(msg).toContain("boom");
  });
});
