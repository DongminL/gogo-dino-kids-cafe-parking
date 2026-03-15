import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { MeterProvider, PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { metrics } from "@opentelemetry/api";

export function register(): void {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const meterProvider: MeterProvider = new MeterProvider({
      readers: [
        new PeriodicExportingMetricReader({
          exporter: new OTLPMetricExporter(),
          exportIntervalMillis: 10000,
        }),
      ],
    });

    metrics.setGlobalMeterProvider(meterProvider);

    const meter = meterProvider.getMeter("gogo-dino-parking");

    meter.createObservableGauge(
      "process_heap_used_bytes", {
        description: "Node.js heap used in bytes",
      }
    ).addCallback((result) => result.observe(process.memoryUsage().heapUsed));

    meter.createObservableGauge(
      "process_rss_bytes", {
        description: "Node.js resident set size in bytes",
      }
    ).addCallback((result) => result.observe(process.memoryUsage().rss));
  }
}
