import { describe, it, expect } from "vitest";
import { __test__mapStatusToError } from "../src/NotionClient.js";

// Verify 5xx responses map to InternalServerError and include body as cause.
describe("NotionClient error mapping helper", () => {
  it("503 -> InternalServerError with body cause", () => {
    const body =
      '{"object":"error","status":503,"code":"service_unavailable"}';
    const err = __test__mapStatusToError(503, body);
    expect(err?.['_tag']).toBe("InternalServerError");
    expect(String(err?.cause)).toContain("service_unavailable");
    expect(String(err?.cause)).toContain("503");
  });
});
