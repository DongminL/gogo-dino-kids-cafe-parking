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
  }
}
