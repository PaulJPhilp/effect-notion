import type * as PR from "@effect/schema/ParseResult";
import * as TreeFormatter from "@effect/schema/TreeFormatter";
import { Effect, Either } from "effect";
import * as S from "effect/Schema";

/**
 * Pretty-format a ParseError into a human-readable tree string.
 */
export const formatParseError = (err: unknown): string => {
  // Pretty format ParseError with Effect.sync + catchAll to avoid TS try/catch
  const pretty = Effect.runSync(
    Effect.sync(() => {
      if (err && (err as { _tag: string })._tag === "ParseError") {
        return TreeFormatter.formatErrorSync
          ? TreeFormatter.formatErrorSync(err as PR.ParseError)
          : safeJson(err);
      }
      return undefined as string | undefined;
    }).pipe(Effect.catchAll(() => Effect.succeed(undefined))),
  );

  if (pretty !== undefined) {
    return pretty;
  }
  if (typeof err === "string") {
    return err;
  }
  if (err instanceof Error) {
    return err.stack ?? `${err.name}: ${err.message}`;
  }
  return safeJson(err);
};

// Safe JSON.stringify using Effect
const safeJson = (value: unknown): string =>
  Effect.runSync(
    Effect.sync(() => JSON.stringify(value, null, 2)).pipe(
      Effect.catchAll(() => Effect.succeed(String(value))),
    ),
  );

/**
 * Decode helper that returns Either<string, A> with pretty error text on Left.
 */
export const prettyDecode =
  <A, I>(schema: S.Schema<A, I>) =>
  (input: I) => {
    const res = S.decodeEither(schema)(input);
    return Either.isRight(res)
      ? Either.right(res.right)
      : Either.left(formatParseError(res.left));
  };

/**
 * Encode helper that returns Either<string, I> with pretty error text on Left.
 */
export const prettyEncode =
  <A, I>(schema: S.Schema<A, I>) =>
  (value: A) => {
    const res = S.encodeEither(schema)(value);
    return Either.isRight(res)
      ? Either.right(res.right)
      : Either.left(formatParseError(res.left));
  };
