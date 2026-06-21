import { trace, context, propagation, SpanStatusCode, SpanKind, type Span, type Context } from "@opentelemetry/api";
import { BasicTracerProvider, BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";

// Re-export so call sites set span kind via the tracing module (centralized OTel access).
export { SpanKind };
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from "@opentelemetry/semantic-conventions";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { W3CTraceContextPropagator } from "@opentelemetry/core";

// OTLP tracing for the relay ((internal ADR) step 3b / (internal ticket)). MANUAL spans + W3C
// `traceparent` propagation, not auto-instrumentation (require-in-the-middle is unreliable
// under Bun; the propagator + AsyncLocalStorage context API work, verified). **Gated**: a no-op
// unless OTEL_EXPORTER_OTLP_ENDPOINT is set, so the services run identically with tracing off, // every helper below degrades to a safe no-op (the API's default no-op tracer/propagator).
//
// Duplicated in packages/present-relay/src/tracing.ts (present-relay is OSS-published; a shared
// package would force the five-place OSS lock-step).

let started = false;

/** Initialise the global tracer once. Call at process start. No-op without the OTLP endpoint. */
export function initTracing(serviceName: string): void {
  if (started) return;
  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
  if (!endpoint) return;
  started = true;
  const provider = new BasicTracerProvider({
    resource: resourceFromAttributes({
      [ATTR_SERVICE_NAME]: serviceName,
      [ATTR_SERVICE_VERSION]: process.env.PRESENT_RELAY_VERSION ?? "unknown",
    }),
    spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter({ url: `${endpoint.replace(/\/$/, "")}/v1/traces` }))],
  });
  trace.setGlobalTracerProvider(provider);
  context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
  propagation.setGlobalPropagator(new W3CTraceContextPropagator());
}

const tracer = () => trace.getTracer("liebstoeckel");

/** Parent context extracted from incoming request headers (W3C traceparent). */
export function ctxFromHeaders(headers: Headers): Context {
  const carrier: Record<string, string> = {};
  headers.forEach((v, k) => {
    carrier[k] = v;
  });
  return propagation.extract(context.active(), carrier);
}

/** Inject the active trace context into outbound headers for downstream propagation. */
export function injectHeaders(h: Record<string, string> = {}): Record<string, string> {
  propagation.inject(context.active(), h);
  return h;
}

/** The active trace id (for stamping into structured logs), or undefined when off/unsampled. */
export function activeTraceId(): string | undefined {
  const sc = trace.getSpanContext(context.active());
  return sc && sc.traceId !== "00000000000000000000000000000000" ? sc.traceId : undefined;
}

/** Run `fn` inside a span (child of `parent` if given, else the active context), recording
 *  errors. Safe no-op semantics when tracing is off (non-recording span, fn still runs). */
export async function withSpan<T>(
  name: string,
  parent: Context | undefined,
  attrs: Record<string, string | number | boolean>,
  fn: (span: Span) => Promise<T> | T,
  // Default INTERNAL; set SERVER on ingress handlers and CLIENT on outbound calls so the
  // service graph + Traces-Drilldown "structure" view can build the trace hierarchy (those
  // views key off SERVER spans with CLIENT edges, INTERNAL-only traces show no structure).
  kind: SpanKind = SpanKind.INTERNAL,
): Promise<T> {
  const base = parent ?? context.active();
  const span = tracer().startSpan(name, { kind, attributes: attrs }, base);
  try {
    return await context.with(trace.setSpan(base, span), () => fn(span));
  } catch (e) {
    span.recordException(e as Error);
    span.setStatus({ code: SpanStatusCode.ERROR, message: String(e) });
    throw e;
  } finally {
    span.end();
  }
}
