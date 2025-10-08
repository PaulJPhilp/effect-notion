import { Effect, FiberRef, Layer } from "effect";
import { describe, expect, it } from "vitest";
import {
  RequestIdRef,
  RequestIdService,
  getCurrentRequestId,
} from "../src/http/requestId.js";

describe("Request ID Middleware", () => {
  it("stores and retrieves request ID from FiberRef", async () => {
    const testRequestId = "test-fiber-ref-456";

    await Effect.runPromise(
      Effect.gen(function* () {
        // Set request ID in FiberRef
        yield* FiberRef.set(RequestIdRef, testRequestId);

        // Verify it can be retrieved
        const retrievedId = yield* getCurrentRequestId();
        expect(retrievedId).toBe(testRequestId);
      }).pipe(
        Effect.provide(Layer.provideMerge(Layer.empty, RequestIdService.Live)),
      ),
    );
  });

  it("generates unique request IDs", () => {
    const { generateRequestId } = require("../src/http/requestId.js");

    const id1 = generateRequestId();
    const id2 = generateRequestId();

    expect(id1).toBeDefined();
    expect(id2).toBeDefined();
    expect(typeof id1).toBe("string");
    expect(typeof id2).toBe("string");
    expect(id1.length).toBeGreaterThan(0);
    expect(id2.length).toBeGreaterThan(0);

    // They should be different (though there's a small chance of collision)
    expect(id1).not.toBe(id2);
  });

  it("extracts request ID from headers when available", () => {
    const { getRequestId } = require("../src/http/requestId.js");

    const headers = { "x-request-id": "provided-id-123" };
    const result = getRequestId(headers);

    expect(result).toBe("provided-id-123");
  });

  it("generates new request ID when header is missing", () => {
    const { getRequestId } = require("../src/http/requestId.js");

    const headers = {};
    const result = getRequestId(headers);

    expect(result).toBeDefined();
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("adds request ID to response headers", () => {
    const { addRequestIdToHeaders } = require("../src/http/requestId.js");

    const headers = { "content-type": "application/json" };
    const requestId = "test-request-123";
    const result = addRequestIdToHeaders(headers, requestId);

    expect(result["x-request-id"]).toBe(requestId);
    expect(result["content-type"]).toBe("application/json");
  });

  it("preserves existing request ID header", () => {
    const { addRequestIdToHeaders } = require("../src/http/requestId.js");

    const headers = {
      "content-type": "application/json",
      "x-request-id": "existing-id-456",
    };
    const requestId = "new-request-789";
    const result = addRequestIdToHeaders(headers, requestId);

    expect(result["x-request-id"]).toBe("existing-id-456"); // Should preserve existing
    expect(result["content-type"]).toBe("application/json");
  });
});
