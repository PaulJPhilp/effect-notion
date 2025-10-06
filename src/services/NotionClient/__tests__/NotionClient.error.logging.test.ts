import { describe, it, expect } from "vitest";
import { __test__mapStatusToError } from "../../../NotionClient.js";

// Verify 5xx responses map to InternalServerError and include body as cause.
describe("NotionClient error mapping helper", () => {
  it("503 -> ServiceUnavailableError with body cause", () => {
    const body =
      '{"object":"error","status":503,"code":"service_unavailable"}';
    const err = __test__mapStatusToError(503, body);
    expect(err?.['_tag']).toBe("ServiceUnavailableError");
    expect(err?.cause).toBe(`503:${body}`);
  });
});
