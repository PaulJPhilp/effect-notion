// no platform-specific layers needed here
import * as HttpApp from "@effect/platform/HttpApp";
import * as HttpRouter from "@effect/platform/HttpRouter";
import * as HttpServerResponse from "@effect/platform/HttpServerResponse";
import * as dotenv from "dotenv";
import { Effect, Layer, Logger } from "effect";
import { NotionClient } from "../src/NotionClient.js";
import { NotionService } from "../src/NotionService.js";
import { AppConfigProviderLive } from "../src/config.js";
import { app } from "../src/router.js";

dotenv.config();

const FullLayer = Layer.mergeAll(
  Logger.json,
  AppConfigProviderLive,
  NotionClient.Default,
  NotionService.Default,
);

const MinimalLayer = Layer.mergeAll(
  Logger.json,
  AppConfigProviderLive,
  NotionClient.Default,
  NotionService.Default,
);

// Pre-response logging handler (logs before platform converts response)
const preLog: HttpApp.PreResponseHandler = (req, res) =>
  Effect.sync(() => {
    // Best-effort logging without any casts
    const url = (req as { url?: string } | undefined)?.url ?? "<unknown>";
    const status = (res as { status?: number } | undefined)?.status ?? 0;
    const bodyObj = (res as { body?: { _tag?: string } } | undefined)?.body;
    const bodyTag =
      bodyObj && typeof bodyObj === "object" && "_tag" in bodyObj
        ? (bodyObj as { _tag?: string })._tag ?? "<none>"
        : "<none>";
    console.log("[pre] url=", url);
    console.log("[pre] status=", status);
    console.log("[pre] bodyTag=", bodyTag);
    return res;
  });

const { handler: fullHandler } = HttpApp.toWebHandlerLayer(
  app,
  FullLayer,
);
const { handler: minimalHandler } = HttpApp.toWebHandlerLayer(
  app,
  MinimalLayer,
);

// Build a minimal app directly to sanity-check adapter
const tinyRouter = HttpRouter.empty.pipe(
  HttpRouter.get(
    "/api/ping",
    Effect.succeed(HttpServerResponse.text("tiny-ok\n", { status: 200 }))
  ),
  HttpRouter.catchAll((e) =>
    HttpServerResponse.json(
      {
        error: String(e),
        tag: (e as { _tag?: string } | undefined)?._tag,
      },
      { status: 500 }
    )
  )
);
const tinyApp = HttpRouter.toHttpApp(tinyRouter) as unknown as HttpApp.Default<
  never,
  never
>;
const tinyAppLogged = HttpApp.withPreResponseHandler(tinyApp, preLog);
const tinyHandler = HttpApp.toWebHandler(
  tinyAppLogged as unknown as HttpApp.Default<never, never>
);

// Even more minimal: always-200 app (no router at all)
const microApp = Effect.succeed(
  HttpServerResponse.text("micro-ok\n", { status: 200 })
) as unknown as HttpApp.Default<never, never>;
const microHandler = HttpApp.toWebHandler(
  microApp as unknown as HttpApp.Default<never, never>
);

async function main() {
  const path = process.argv[2] || "/api/health";
  console.log("Requesting:", path);
  try {
    const res1 = await fullHandler(new Request(`http://localhost${path}`));
    const text1 = await res1.text();
    console.log("full: status=", res1.status);
    console.log("full: headers=", Object.fromEntries(res1.headers.entries()));
    console.log("full: body=", text1);
  } catch (e) {
    console.error("full handler threw:", e);
  }
  try {
    const res2 = await minimalHandler(new Request(`http://localhost${path}`));
    const text2 = await res2.text();
    console.log("minimal: status=", res2.status);
    console.log(
      "minimal: headers=",
      Object.fromEntries(res2.headers.entries())
    );
    console.log("minimal: body=", text2);
  } catch (e) {
    console.error("minimal handler threw:", e);
  }
  try {
    const res3 = await tinyHandler(new Request(`http://localhost${path}`));
    const text3 = await res3.text();
    console.log("tiny: status=", res3.status);
    console.log("tiny: headers=", Object.fromEntries(res3.headers.entries()));
    console.log("tiny: body=", text3);
  } catch (e) {
    console.error("tiny handler threw:", e);
  }
  try {
    const res4 = await microHandler(new Request("http://localhost/any"));
    const text4 = await res4.text();
    console.log("micro: status=", res4.status);
    console.log("micro: headers=", Object.fromEntries(res4.headers.entries()));
    console.log("micro: body=", text4);
  } catch (e) {
    console.error("micro handler threw:", e);
  }
}

main().catch((e) => {
  console.error("diagnose error", e);
  process.exit(1);
});
