import { Effect } from "effect";
import { InternalServerError, type NotionError } from "../NotionClient/errors.js";

/**
 * Maps unknown errors to NotionError types.
 * 
 * If the error is already a tagged NotionError, returns it as-is.
 * Otherwise, wraps it in InternalServerError.
 * 
 * @deprecated Prefer using Effect.catchAll with proper type narrowing
 */
export const mapUnknownToNotionError = (e: unknown): NotionError =>
  typeof (e as { _tag?: unknown })._tag === "string"
    ? (e as NotionError)
    : new InternalServerError({ cause: e });

export const tapWarn = (message: string) =>
  Effect.tapError((e: unknown) =>
    Effect.logWarning(
      `${message}; tag=${(e as { _tag?: string })?._tag ?? "Unknown"}`
    )
  );
