// test/index.test.ts
import { describe, it, expect } from "vitest";
import { Effect, Either } from "effect";

describe("Initial Effect Test", () => {
  it("should succeed with a value", () => {
    const success = Effect.succeed(42);
    const result = Effect.runSync(success);
    expect(result).toBe(42);
  });

  it("should fail with a value", () => {
    const failure = Effect.fail("Oh no!");
    const result = Effect.runSync(Effect.either(failure));
    expect(result).toEqual(Either.left("Oh no!"));
  });
});
