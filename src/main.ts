import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import * as HttpMiddleware from "@effect/platform/HttpMiddleware";
import * as HttpServer from "@effect/platform/HttpServer";
import { createServer } from "node:http";
// src/main.ts
import { Effect, Layer, Logger } from "effect";
import {
  AppConfig,
  AppConfigProviderLive,
  ValidatedAppConfig,
  buildCorsOptions,
} from "./config.js";
import { app } from "./router.js";
import { NotionService } from "./services/NotionService/service.js";

// The main application logic, dependent on AppConfig
const Main = Effect.gen(function* () {
  const config = yield* AppConfig;

  const corsMiddleware = HttpMiddleware.cors(buildCorsOptions(config));

  // Perform non-fatal config validation (e.g., prod requires NOTION_API_KEY)
  const validation = yield* Effect.either(ValidatedAppConfig);
  if (validation._tag === "Left") {
    yield* Effect.logWarning(
      `Configuration validation failed; continuing to serve. Health will report 503. detail=${String(
        validation.left
      )}`
    );
  }

  // Apply request/response logging and CORS middleware
  const ServerLive = HttpServer.serve(
    HttpMiddleware.logger(corsMiddleware(app))
  );

  // Create the server layer with the configured port
  const HttpLive = NodeHttpServer.layer(() => createServer(), {
    port: config.port,
  });
  // Provide platform default services required by HttpApp
  const PlatformLive = HttpServer.layerContext;

  // Simple program that keeps the server alive
  const main = Effect.never.pipe(
    Effect.provide(ServerLive),
    Effect.provide(HttpLive),
    Effect.provide(PlatformLive),
    Effect.scoped,
    Effect.tap(() =>
      Effect.logInfo(`Server running on http://localhost:${config.port}`)
    )
  );
  // Return the program so Main has type Effect<void, E, R>
  return yield* main.pipe(Effect.asVoid);
});

// Create log level layer from config
const LogLevelLayer = Layer.unwrapEffect(
  AppConfig.pipe(Effect.map((cfg) => Logger.minimumLogLevel(cfg.logLevel)))
);

const AppLayers = Layer.mergeAll(
  Logger.json,
  LogLevelLayer,
  AppConfigProviderLive,
  NotionService.Default
);

const Program = Main.pipe(
  Effect.provide(AppLayers),
  Effect.asVoid
) as Effect.Effect<void, never, never>;

NodeRuntime.runMain(Program);
