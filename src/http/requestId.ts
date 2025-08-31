import { FiberRef } from "effect";

// FiberRef to store the current request ID
export const RequestIdRef = FiberRef.unsafeMake("");

// Generate a UUID-like request ID
export function generateRequestId(): string {
  return Math.random().toString(36).slice(2, 10);
}

// Extract request ID from headers or generate a new one
export function getRequestId(headers: Record<string, unknown>): string {
  const headerReqId = headers["x-request-id"] as string | undefined;
  return headerReqId || generateRequestId();
}

// Helper to get current request ID from context
export const getCurrentRequestId = () => FiberRef.get(RequestIdRef);

// Helper to set current request ID in context
export const setCurrentRequestId = (requestId: string) =>
  FiberRef.set(RequestIdRef, requestId);

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
