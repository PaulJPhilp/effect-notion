import * as HttpServerRequest from "@effect/platform/HttpServerRequest";
import * as HttpServerResponse from "@effect/platform/HttpServerResponse";
import { Effect } from "effect";

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
}) {
  return Effect.gen(function* () {
    const req = yield* HttpServerRequest.HttpServerRequest;
    const headers = req.headers;
    const headerReqId =
      (headers["x-request-id"] as string | undefined) ?? undefined;
    const requestId = headerReqId || generateRequestId();

    const body: ApiErrorBody = {
      error: args.error,
      code: args.code,
      requestId,
      ...(args.detail !== undefined ? { detail: String(args.detail) } : {}),
      ...(args.errors && args.errors.length > 0 ? { errors: args.errors } : {}),
    };

    return yield* HttpServerResponse.json(body, {
      status: args.status,
      headers: { "x-request-id": requestId },
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
    detail: options?.detail,
    errors: options?.errors,
  });

export const unauthorized = (detail?: unknown) =>
  errorResponse({
    status: 401,
    code: "InvalidApiKey",
    error: "Invalid API Key",
    detail,
  });

export const notFound = (detail?: unknown) =>
  errorResponse({
    status: 404,
    code: "NotFound",
    error: "Resource not found",
    detail,
  });

export const internalError = (detail?: unknown) =>
  errorResponse({
    status: 500,
    code: "InternalServerError",
    error: "Internal Server Error",
    detail,
  });
