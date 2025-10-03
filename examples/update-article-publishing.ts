/**
 * Example: Update Article Publishing Workflow
 * 
 * This example demonstrates how to use the NotionService to:
 * 1. Fetch article metadata
 * 2. Update publishing status and date
 * 3. Handle errors appropriately
 */

import { Effect } from "effect";
import { NotionService } from "../src/NotionService.js";
import type { NotionError } from "../src/NotionClient.js";

/**
 * Publish an article by updating its status and published date
 */
export const publishArticle = (
  pageId: string
): Effect.Effect<
  { success: boolean; properties: unknown },
  NotionError
> =>
  Effect.gen(function* () {
    const notionService = yield* NotionService;

    // Step 1: Fetch current metadata to verify article exists
    yield* Effect.logInfo(`Fetching metadata for article ${pageId}`);
    const currentMetadata = yield* notionService.getArticleMetadata(pageId);
    yield* Effect.logInfo("Current metadata retrieved successfully");

    // Step 2: Prepare publishing properties
    const publishingProperties = {
      Status: {
        select: {
          name: "Published",
        },
      },
      "Published Date": {
        date: {
          start: new Date().toISOString(),
        },
      },
    };

    // Step 3: Update the article properties
    yield* Effect.logInfo(`Publishing article ${pageId}`);
    const updatedMetadata = yield* notionService.updateArticleProperties(
      pageId,
      publishingProperties
    );

    yield* Effect.logInfo(`Article ${pageId} published successfully`);

    return {
      success: true,
      properties: updatedMetadata.properties,
    };
  });

/**
 * Unpublish an article by updating its status to Draft
 */
export const unpublishArticle = (
  pageId: string
): Effect.Effect<
  { success: boolean; properties: unknown },
  NotionError
> =>
  Effect.gen(function* () {
    const notionService = yield* NotionService;

    yield* Effect.logInfo(`Unpublishing article ${pageId}`);

    const properties = {
      Status: {
        select: {
          name: "Draft",
        },
      },
    };

    const result = yield* notionService.updateArticleProperties(
      pageId,
      properties
    );

    yield* Effect.logInfo(`Article ${pageId} unpublished successfully`);

    return {
      success: true,
      properties: result.properties,
    };
  });

/**
 * Schedule an article for future publishing
 */
export const scheduleArticle = (
  pageId: string,
  publishDate: Date
): Effect.Effect<
  { success: boolean; scheduledFor: string },
  NotionError
> =>
  Effect.gen(function* () {
    const notionService = yield* NotionService;

    yield* Effect.logInfo(
      `Scheduling article ${pageId} for ${publishDate.toISOString()}`
    );

    const properties = {
      Status: {
        select: {
          name: "Scheduled",
        },
      },
      "Published Date": {
        date: {
          start: publishDate.toISOString(),
        },
      },
    };

    yield* notionService.updateArticleProperties(pageId, properties);

    yield* Effect.logInfo(`Article ${pageId} scheduled successfully`);

    return {
      success: true,
      scheduledFor: publishDate.toISOString(),
    };
  });

/**
 * Update article metadata with multiple properties
 */
export const updateArticleMetadata = (
  pageId: string,
  updates: {
    status?: string;
    tags?: string[];
    featured?: boolean;
    publishedDate?: Date;
  }
): Effect.Effect<{ success: boolean }, NotionError> =>
  Effect.gen(function* () {
    const notionService = yield* NotionService;

    yield* Effect.logInfo(`Updating metadata for article ${pageId}`);

    // Build properties object based on provided updates
    const properties: Record<string, unknown> = {};

    if (updates.status) {
      properties.Status = {
        select: {
          name: updates.status,
        },
      };
    }

    if (updates.tags) {
      properties.Tags = {
        multi_select: updates.tags.map((tag) => ({ name: tag })),
      };
    }

    if (updates.featured !== undefined) {
      properties.Featured = {
        checkbox: updates.featured,
      };
    }

    if (updates.publishedDate) {
      properties["Published Date"] = {
        date: {
          start: updates.publishedDate.toISOString(),
        },
      };
    }

    yield* notionService.updateArticleProperties(pageId, properties);

    yield* Effect.logInfo(`Article ${pageId} metadata updated successfully`);

    return { success: true };
  });

/**
 * Batch publish multiple articles
 */
export const batchPublishArticles = (
  pageIds: string[]
): Effect.Effect<
  { published: number; failed: number },
  never
> =>
  Effect.gen(function* () {
    yield* Effect.logInfo(`Batch publishing ${pageIds.length} articles`);

    const results = yield* Effect.forEach(
      pageIds,
      (pageId) =>
        publishArticle(pageId).pipe(
          Effect.map(() => ({ success: true, pageId })),
          Effect.catchAll((error) =>
            Effect.gen(function* () {
              yield* Effect.logWarning(
                `Failed to publish article ${pageId}: ${error._tag}`
              );
              return { success: false, pageId };
            })
          )
        ),
      { concurrency: 5 } // Respect Notion API rate limits
    );

    const published = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    yield* Effect.logInfo(
      `Batch publish complete: ${published} published, ${failed} failed`
    );

    return { published, failed };
  });

/**
 * Example: Publishing workflow with validation
 */
export const publishWithValidation = (
  pageId: string
): Effect.Effect<
  { success: boolean; message: string },
  NotionError
> =>
  Effect.gen(function* () {
    const notionService = yield* NotionService;

    // Fetch current metadata
    const metadata = yield* notionService.getArticleMetadata(pageId);
    const props = metadata.properties as Record<string, any>;

    // Validate article is ready to publish
    // (This is a simplified example - adjust based on your schema)
    const hasTitle = props.Name || props.Title;
    const hasContent = true; // Would check content in real scenario

    if (!hasTitle) {
      yield* Effect.logWarning(
        `Article ${pageId} cannot be published: missing title`
      );
      return {
        success: false,
        message: "Article must have a title before publishing",
      };
    }

    if (!hasContent) {
      yield* Effect.logWarning(
        `Article ${pageId} cannot be published: missing content`
      );
      return {
        success: false,
        message: "Article must have content before publishing",
      };
    }

    // Proceed with publishing
    yield* publishArticle(pageId);

    return {
      success: true,
      message: "Article published successfully",
    };
  });
