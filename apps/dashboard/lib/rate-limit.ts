import { ValidationError } from "@/lib/errors";

interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
}

const buckets = new Map<string, { count: number; resetAt: number }>();

export function enforceRateLimit({ key, limit, windowMs }: RateLimitOptions) {
  const now = Date.now();
  const current = buckets.get(key);

  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return;
  }

  if (current.count >= limit) {
    throw new ValidationError("Rate limit exceeded", {
      retry_after_seconds: Math.ceil((current.resetAt - now) / 1000)
    });
  }

  current.count += 1;
}

export function rateLimitKey(request: Request, scope: string) {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const realIp = request.headers.get("x-real-ip");
  return `${scope}:${forwarded ?? realIp ?? "local"}`;
}
