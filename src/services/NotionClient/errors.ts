import { Data } from "effect";

export class InvalidApiKeyError extends Data.TaggedError("InvalidApiKeyError")<{
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

export type NotionError =
  | InvalidApiKeyError
  | NotFoundError
  | BadRequestError
  | InternalServerError;
