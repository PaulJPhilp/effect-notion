import * as HttpServerRequest from "@effect/platform/HttpServerRequest";
import * as HttpServerResponse from "@effect/platform/HttpServerResponse";
import { Effect } from "effect";
import { getCurrentRequestId } from "./http/requestId.js";

export interface ApiErrorBody {
  readonly error: string;
  readonly code: string;
  readonly requestId: string;
  readonly detail?: string;
  readonly errors?: ReadonlyArray<string>;
}

function generateRequestId(): string {
  return Math.random().toString(36).slice(2, 10);
}

export function errorResponse(args: {
  readonly status: number;
  readonly code: string;
  readonly error: string;
  readonly detail?: unknown;
  readonly errors?: ReadonlyArray<string>;
  readonly headers?: Readonly<Record<string, string>>;
}) {
  return Effect.gen(function* () {
    const req = yield* HttpServerRequest.HttpServerRequest;
    const headers = req.headers;

    // Try to get request ID from FiberRef first, then header, then generate
    const fiberReqId = yield* getCurrentRequestId();
    const headerReqId = headers["x-request-id"] as string | undefined;
    const requestId = fiberReqId || headerReqId || generateRequestId();

    const body: ApiErrorBody = {
      error: args.error,
      code: args.code,
      requestId,
      ...(args.detail !== undefined ? { detail: String(args.detail) } : {}),
      ...(args.errors && args.errors.length > 0 ? { errors: args.errors } : {}),
    };

    const extraHeaders = args.headers ?? {};
    const responseHeaders = {
      ...extraHeaders,
      "x-request-id": requestId,
    } as const;

    return yield* HttpServerResponse.json(body, {
      status: args.status,
      headers: responseHeaders,
    });
  });
}

export const badRequest = (options?: {
  readonly detail?: unknown;
  readonly errors?: ReadonlyArray<string>;
}) =>
  errorResponse({
    status: 400,
    code: "BadRequest",
    error: "Bad Request",
    ...(options?.detail !== undefined ? { detail: options.detail } : {}),
    ...(options?.errors && options.errors.length > 0
      ? { errors: options.errors }
      : {}),
  });

export const unauthorized = (detail?: unknown) =>
  errorResponse({
    status: 401,
    code: "InvalidApiKey",
    error: "Invalid API Key",
    ...(detail !== undefined ? { detail } : {}),
  });

export const forbidden = (detail?: unknown) =>
  errorResponse({
    status: 403,
    code: "Forbidden",
    error: "Forbidden",
    ...(detail !== undefined ? { detail } : {}),
  });

export const notFound = (detail?: unknown) =>
  errorResponse({
    status: 404,
    code: "NotFound",
    error: "Resource not found",
    ...(detail !== undefined ? { detail } : {}),
  });

export const conflict = (detail?: unknown) =>
  errorResponse({
    status: 409,
    code: "Conflict",
    error: "Conflict",
    ...(detail !== undefined ? { detail } : {}),
  });

export const tooManyRequests = (options?: {
  readonly detail?: unknown;
  readonly retryAfterSeconds?: number;
}) =>
  errorResponse({
    status: 429,
    code: "TooManyRequests",
    error: "Too Many Requests",
    ...(options?.detail !== undefined ? { detail: options.detail } : {}),
    ...(options?.retryAfterSeconds !== undefined
      ? {
          headers: {
            "retry-after": String(options.retryAfterSeconds),
          } as const,
        }
      : {}),
  });

export const internalError = (detail?: unknown) =>
  errorResponse({
    status: 500,
    code: "InternalServerError",
    error: "Internal Server Error",
    ...(detail !== undefined ? { detail } : {}),
  });

export const serviceUnavailable = (detail?: unknown) =>
  errorResponse({
    status: 503,
    code: "ServiceUnavailable",
    error: "Service Unavailable",
    ...(detail !== undefined ? { detail } : {}),
  });

export const requestTimeout = (detail?: unknown) =>
  errorResponse({
    status: 504,
    code: "RequestTimeout",
    error: "Gateway Timeout",
    ...(detail !== undefined ? { detail } : {}),
  });
