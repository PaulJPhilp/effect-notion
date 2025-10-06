import { Effect } from "effect";

/**
 * Logger for adapters executed strictly inside Effect.
 * Fire-and-forget a warning log via the Effect runtime.
 */
export const logWarn = (message: string): void => {
  Effect.runFork(Effect.logWarning(message));
};

/**
 * Info-level log for adapters in Effect context.
 */
export const logInfo = (message: string): void => {
  Effect.runFork(Effect.logInfo(message));
};

/**
 * Error-level log for adapters in Effect context.
 */
export const logError = (message: string): void => {
  Effect.runFork(Effect.logError(message));
};
