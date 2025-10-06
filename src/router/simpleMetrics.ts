import * as HttpRouter from "@effect/platform/HttpRouter";
import * as HttpServerRequest from "@effect/platform/HttpServerRequest";
import * as HttpServerResponse from "@effect/platform/HttpServerResponse";
import { Effect, Metric } from "effect";
import {
  addRequestIdToHeaders,
  getRequestId,
  setCurrentRequestId,
} from "../http/requestId.js";

/**
 * Applies metrics routes to the router.
 * 
 * Provides a `/api/metrics` endpoint that returns Effect metrics
 * in a simple text format.
 */
export const applySimpleMetricsRoutes = <
  // biome-ignore lint/suspicious/noExplicitAny: generic router type
  T extends { pipe: (...fns: Array<(self: any) => any>) => any }
>(
  router: T
): T =>
  router.pipe(
    HttpRouter.get(
      "/api/metrics",
      Effect.gen(function* () {
        // Extract request ID and store in FiberRef for logging
        const req = yield* HttpServerRequest.HttpServerRequest;
        const requestId = getRequestId(req.headers);
        yield* setCurrentRequestId(requestId);

        // Get Effect metrics snapshot
        const snapshot = yield* Metric.snapshot;
        
        // Convert to simple text format
        // Note: Effect metrics are more structured than this simple
        // format. For production, consider using a proper metrics
        // exporter (Prometheus, OpenTelemetry, etc.)
        const metricsText = snapshot
          .map((pair) => {
            const name = pair.metricKey.name;
            const value = JSON.stringify(pair.metricState);
            return `${name}: ${value}`;
          })
          .join("\n");

        // Add request ID to response headers
        return yield* HttpServerResponse.text(metricsText, {
          status: 200,
          headers: addRequestIdToHeaders(
            {
              "content-type": "text/plain; charset=utf-8",
            },
            requestId
          ),
        });
      })
    )
  );

export default applySimpleMetricsRoutes;
