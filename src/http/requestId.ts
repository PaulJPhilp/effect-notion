import { Context, Effect, FiberRef, Layer } from "effect";

/**
 * Service for managing request IDs in a fiber-safe manner.
 * 
 * This service provides a FiberRef for storing request IDs that are
 * scoped to individual HTTP requests. Each request runs in its own
 * fiber, ensuring proper isolation.
 */
export class RequestIdService extends Context.Tag("RequestIdService")<
  RequestIdService,
  {
    readonly ref: FiberRef.FiberRef<string>;
  }
>() {
  /**
   * Live layer that creates the RequestId service with a proper
   * FiberRef initialized within an Effect context.
   */
  static readonly Live = Layer.sync(this, () => ({
    ref: FiberRef.unsafeMake(""),
  }));
}

/**
 * Generates a random request ID.
 * 
 * Note: This uses Math.random() which is acceptable for request
 * tracing IDs (not cryptographic use).
 * 
 * @returns 8-character alphanumeric string
 */
export function generateRequestId(): string {
  return Math.random().toString(36).slice(2, 10);
}

/**
 * Extracts request ID from headers or generates a new one.
 * 
 * @param headers - HTTP request headers
 * @returns Request ID from x-request-id header or newly generated
 */
export function getRequestId(headers: Record<string, unknown>): string {
  const headerReqId = headers["x-request-id"] as string | undefined;
  return headerReqId || generateRequestId();
}

/**
 * Gets the current request ID from the fiber-local context.
 * 
 * @returns Effect that yields the current request ID
 */
export const getCurrentRequestId = (): Effect.Effect<
  string,
  never,
  RequestIdService
> =>
  Effect.gen(function* () {
    const service = yield* RequestIdService;
    return yield* FiberRef.get(service.ref);
  });

/**
 * Sets the request ID in the fiber-local context.
 * 
 * This should be called at the start of each request handler to
 * establish the request ID for logging and tracing.
 * 
 * @param requestId - The request ID to set
 * @returns Effect that sets the request ID
 */
export const setCurrentRequestId = (
  requestId: string
): Effect.Effect<void, never, RequestIdService> =>
  Effect.gen(function* () {
    const service = yield* RequestIdService;
    yield* FiberRef.set(service.ref, requestId);
  });

// Helper to add request ID to response headers
export function addRequestIdToHeaders(
  headers: Record<string, string | readonly string[] | undefined>,
  requestId: string
): Record<string, string | readonly string[] | undefined> {
  if (headers["x-request-id"]) {
    return headers;
  }
  return {
    ...headers,
    "x-request-id": requestId,
  };
}
