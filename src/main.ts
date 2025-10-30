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
import { RequestIdService } from "./http/requestId.js";
import { app } from "./router.js";
import { ArticlesRepository } from "./services/ArticlesRepository.js";
import { NotionClient } from "./services/NotionClient.js";
import { NotionService } from "./services/NotionService/service.js";

console.log("Starting effect-notion server...");

// The main application logic, dependent on AppConfig
const Main = Effect.gen(function* () {
  console.log("Inside Main function...");
  const config = yield* AppConfig;
  console.log("Config loaded:", { port: config.port, env: config.env });

  const corsMiddleware = HttpMiddleware.cors(buildCorsOptions(config));
  console.log("CORS middleware created");

  // Perform non-fatal config validation (e.g., prod requires NOTION_API_KEY)
  const validation = yield* Effect.either(ValidatedAppConfig);
  console.log("Config validation completed");
  if (validation._tag === "Left") {
    yield* Effect.logWarning(
      `Configuration validation failed; continuing to serve. Health will report 503. detail=${String(
        validation.left,
      )}`,
    );
  }

  // Apply request/response logging and CORS middleware
  const ServerLive = HttpServer.serve(
    HttpMiddleware.logger(corsMiddleware(app)),
  );
  console.log("ServerLive created");

  // Create the server layer with the configured port
  const HttpLive = NodeHttpServer.layer(() => createServer(), {
    port: config.port,
  });
  console.log("HttpLive created");
  // Provide platform default services required by HttpApp
  const PlatformLive = HttpServer.layerContext;

  // Simple program that keeps the server alive
  const main = Effect.never.pipe(
    Effect.provide(ServerLive),
    Effect.provide(HttpLive),
    Effect.provide(PlatformLive),
    Effect.scoped,
    Effect.tap(() => {
      const serverUrl = `http://localhost:${config.port}`;
      console.log(`✅ Server is working! Access it at: ${serverUrl}`);
      return Effect.logInfo(`Server running on ${serverUrl}`);
    }),
  );
  // Return the program so Main has type Effect<void, E, R>
  return yield* main.pipe(Effect.asVoid);
});

// Create log level layer from config
const LogLevelLayer = Layer.unwrapEffect(
  AppConfig.pipe(Effect.map((cfg) => Logger.minimumLogLevel(cfg.logLevel))),
);

const AppLayers = Layer.mergeAll(
  Logger.json,
  LogLevelLayer,
  AppConfigProviderLive,
  RequestIdService.Live,
  NotionClient.Default,
  NotionService.Default,
  ArticlesRepository.Default,
);

const Program = Main.pipe(
  Effect.provide(AppLayers),
  Effect.asVoid,
) as Effect.Effect<void, never, never>;

NodeRuntime.runMain(Program);
