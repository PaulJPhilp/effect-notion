// Compatibility re-exports for legacy imports
export { NotionService } from "./services/NotionService/service.js";
export {
  notionBlocksToMarkdown,
  markdownToNotionBlocks,
  normalizeDatabase,
  getAllPaginatedResults,
} from "./services/NotionService/helpers.js";
