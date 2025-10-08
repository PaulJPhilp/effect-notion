import * as dotenv from "dotenv";
import { Effect, Layer } from "effect";
import { NotionClient } from "../src/NotionClient.js";
import { AppConfigProviderLive } from "../src/config.js";

dotenv.config();

const { NOTION_API_KEY, NOTION_DB_ARTICLES_BLOG } = process.env as Record<
  string,
  string | undefined
>;

const Main = Effect.gen(function* () {
  if (!NOTION_API_KEY) {
    console.error("NOTION_API_KEY missing");
    process.exit(1);
  }
  const dbId = process.argv[2] || NOTION_DB_ARTICLES_BLOG || "<missing-db-id>";
  console.log("Querying DB:", dbId);

  const notion = yield* NotionClient;
  const eff = notion.queryDatabase(dbId, {
    page_size: 5,
  });

  const res = yield* eff.pipe(
    Effect.map((ok) => ({ ok: true as const, value: ok })),
    Effect.catchAll((e) =>
      Effect.succeed({ ok: false as const, error: e as unknown }),
    ),
  );

  console.log(JSON.stringify(res, Object.getOwnPropertyNames(res), 2));
});

Effect.runPromise(
  Main.pipe(
    Effect.provide(Layer.mergeAll(NotionClient.Default, AppConfigProviderLive)),
  ),
).catch((e) => {
  console.error("diag-query failed", e);
  process.exit(1);
});
