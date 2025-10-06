// Compatibility re-exports for legacy imports used by tests and callers
// Import the Effect.Service class from the new split location
export { NotionClient } from "./services/NotionClient/service.js";
// Re-export error types and union
export * from "./services/NotionClient/errors.js";
// Re-export test helper for existing tests
export { __test__mapStatusToError } from "./services/NotionClient/helpers.js";
