import { metrics } from "@opentelemetry/api";

const meter = metrics.getMeter("gogo-dino-parking");

export const httpRequestsTotal = meter.createCounter(
  "http_requests_total", { 
    description: "Total number of HTTP requests", 
  }
);

export const httpRequestDurationSeconds = meter.createHistogram(
  "http_request_duration_seconds", {
    description: "HTTP request duration in seconds",
    unit: "s",
    advice: {
      explicitBucketBoundaries: [0.1, 0.3, 0.5, 1, 2, 5],
    },
  }
);
