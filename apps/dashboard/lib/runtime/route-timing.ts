import { NextResponse } from "next/server";

export interface RouteTiming {
  startedAt: number;
}

export function startRouteTiming(): RouteTiming {
  return { startedAt: Date.now() };
}

export function runtimeMs(timing: RouteTiming) {
  return Date.now() - timing.startedAt;
}

export function timedJson<T extends Record<string, unknown>>(body: T, timing: RouteTiming, init?: ResponseInit) {
  const duration = runtimeMs(timing);
  const response = NextResponse.json(
    {
      ...body,
      meta: {
        ...(isRecord(body.meta) ? body.meta : {}),
        runtimeMs: duration
      }
    },
    init
  );
  response.headers.set("x-operion-runtime-ms", String(duration));
  return response;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
