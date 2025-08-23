// src/main.ts
import { Effect, Layer, Logger } from "effect";
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { createServer } from "node:http";
import * as HttpMiddleware from "@effect/platform/HttpMiddleware";
import * as HttpServer from "@effect/platform/HttpServer";
import { app } from "./router.js";
import { NotionService } from "./NotionService.js";
import { AppConfig, AppConfigProviderLive } from "./config.js";

// The main application logic, dependent on AppConfig
const Main = Effect.gen(function* () {
  const config = yield* AppConfig;

  const corsMiddleware = HttpMiddleware.cors({
    allowedOrigins: [config.corsOrigin],
    allowedMethods: ["POST", "GET"],
    allowedHeaders: ["Content-Type", "Authorization"],
  });

  // `app` is Effect<HttpApp>, evaluate it first
  const httpApp = yield* app;
  // Apply CORS as middleware using the curried serve overload
  const ServerLive = HttpServer.serve(corsMiddleware)(httpApp);

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
      Effect.logInfo(`Server running on http://localhost:${config.port}`),
    ),
  );
  // Return the program so Main has type Effect<void, E, R>
  return yield* main.pipe(Effect.asVoid);
});

const AppLayers = Layer.mergeAll(
  Logger.json,
  AppConfigProviderLive,
  NotionService.Default,
);

const Program = Main.pipe(
  Effect.provide(AppLayers),
  Effect.asVoid,
) as Effect.Effect<void, never, never>;

NodeRuntime.runMain(Program);