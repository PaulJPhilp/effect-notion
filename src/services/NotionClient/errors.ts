import { Data } from "effect";

export class InvalidApiKeyError extends Data.TaggedError("InvalidApiKeyError")<{
  readonly cause: unknown;
}> {}

export class ForbiddenError extends Data.TaggedError("ForbiddenError")<{
  readonly cause: unknown;
}> {}

export class NotFoundError extends Data.TaggedError("NotFoundError")<{
  readonly cause: unknown;
}> {}

export class BadRequestError extends Data.TaggedError("BadRequestError")<{
  readonly cause: unknown;
}> {}

export class InternalServerError extends Data.TaggedError(
  "InternalServerError"
)<{
  readonly cause: unknown;
}> {}

export class RequestTimeoutError extends Data.TaggedError(
  "RequestTimeoutError"
)<{
  readonly timeoutMs: number;
  readonly cause?: unknown;
}> {}

export class RateLimitedError extends Data.TaggedError("RateLimitedError")<{
  readonly retryAfterSeconds?: number;
  readonly cause?: unknown;
}> {}

export class ConflictError extends Data.TaggedError("ConflictError")<{
  readonly cause: unknown;
}> {}

export class ServiceUnavailableError extends Data.TaggedError(
  "ServiceUnavailableError"
)<{
  readonly cause: unknown;
}> {}

export type NotionError =
  | InvalidApiKeyError
  | ForbiddenError
  | NotFoundError
  | BadRequestError
  | InternalServerError
  | RequestTimeoutError
  | RateLimitedError
  | ConflictError
  | ServiceUnavailableError;

/**
 * Maps unknown errors to NotionError types.
 * 
 * If the error is already a tagged NotionError, returns it as-is.
 * Otherwise, wraps it in InternalServerError.
 * 
 * This helper ensures all errors in the Notion domain are properly typed.
 * 
 * @param e - Unknown error to map
 * @returns Properly typed NotionError
 */
export const mapToNotionError = (e: unknown): NotionError =>
  typeof (e as { _tag?: unknown })._tag === "string"
    ? (e as NotionError)
    : new InternalServerError({ cause: e });

export const mapHttpStatusToNotionError = (
  status: number,
  body: string,
  retryAfterSeconds?: number
): NotionError | undefined => {
  switch (status) {
    case 400:
    case 422:
      return new BadRequestError({ cause: body });
    case 401:
      return new InvalidApiKeyError({ cause: body });
    case 403:
      return new ForbiddenError({ cause: body });
    case 404:
      return new NotFoundError({ cause: body });
    case 409:
      return new ConflictError({ cause: body });
    case 429:
      return new RateLimitedError({
        ...(body.length > 0 ? { cause: body } : {}),
        ...(retryAfterSeconds !== undefined
          ? { retryAfterSeconds }
          : {}),
      });
    case 503:
      return new ServiceUnavailableError({ cause: body });
    default:
      if (status >= 500) {
        return new InternalServerError({ cause: `${status}:${body}` });
      }
      return undefined;
  }
};
