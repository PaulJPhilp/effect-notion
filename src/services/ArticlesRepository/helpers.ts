import { Effect } from "effect";
import { type NotionError, mapToNotionError } from "../NotionClient/errors.js";

/**
 * Maps unknown errors to NotionError types.
 *
 * @deprecated Use mapToNotionError from errors.ts instead
 */
export const mapUnknownToNotionError = mapToNotionError;

export const tapWarn = (message: string) =>
  Effect.tapError((e: unknown) =>
    Effect.logWarning(
      `${message}; tag=${(e as { _tag?: string })?._tag ?? "Unknown"}`,
    ),
  );
