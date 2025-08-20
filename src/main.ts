// src/main.ts
import { Effect, Layer } from "effect";
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node";
import { Http } from "@effect/platform";
import { app } from "./router";
import { NotionServiceLive } from "./NotionService";

// 1. Define the HTTP server layer, specifying the port.
const HttpLive = NodeHttpServer.layer({ port: 3000 });

// 2. Define the main application layer by composing our service
//    implementation with the HTTP server layer.
const MainLive = Layer.provide(NotionServiceLive, HttpLive);

// 3. Define the CORS middleware configuration.
//    This allows requests from any origin, which is fine for development.
//    For production, you should restrict this to your frontend's domain.
const corsMiddleware = Http.middleware.cors({
  allowedMethods: ["POST"], // Allow only POST method
  allowedHeaders: ["Content-Type"], // Allow the Content-Type header
});

// 4. Create the main server effect.
//    It takes our router's app, applies the CORS middleware,
//    and serves it.
const server = Http.server.serve(corsMiddleware(app)).pipe(
  Effect.tap(() => Effect.log("Server running on http://localhost:3000")),
  // This ensures the server runs forever
  Effect.scoped,
);

// 5. The final runnable program.
//    We provide the composed MainLive layer to the server effect.
const main = Effect.provide(server, MainLive);

// 6. Execute the program using the Node.js runtime.
NodeRuntime.runMain(main);