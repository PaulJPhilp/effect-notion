import * as HttpRouter from "@effect/platform/HttpRouter";
import * as HttpServerRequest from "@effect/platform/HttpServerRequest";
import * as HttpServerResponse from "@effect/platform/HttpServerResponse";
import { Effect } from "effect";
import { globalMetrics } from "../metrics/simple.js";
import { getCurrentRequestId, setCurrentRequestId, getRequestId, addRequestIdToHeaders } from "../http/requestId.js";

export const applySimpleMetricsRoutes = <
  T extends { pipe: (...fns: Array<(self: any) => any>) => any }
>(
  router: T
): T =>
  router.pipe(
    HttpRouter.get(
      "/api/metrics",
      Effect.gen(function* () {
        // Extract request ID and store in FiberRef for logging context
        const req = yield* HttpServerRequest.HttpServerRequest;
        const requestId = getRequestId(req.headers);
        yield* setCurrentRequestId(requestId);

        // Get metrics from the simple metrics service
        const metrics = globalMetrics.getMetrics();
        
        // Convert to Prometheus format
        const prometheusMetrics = Object.entries(metrics)
          .map(([name, value]) => {
            if (typeof value === 'number') {
              return `${name} ${value}`;
            }
            return `${name} ${JSON.stringify(value)}`;
          })
          .join('\n');

        // Add request ID to response headers
        return yield* HttpServerResponse.text(prometheusMetrics, {
          status: 200,
          headers: addRequestIdToHeaders({
            "content-type": "text/plain; version=0.0.4; charset=utf-8",
          }, requestId),
        });
      })
    )
  );

export default applySimpleMetricsRoutes;
