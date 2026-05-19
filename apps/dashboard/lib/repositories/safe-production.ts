import { productionRepository as original } from "./production";
import { logger } from "@/lib/logger";

const SUPABASE_ENABLED = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY) && process.env.SKIP_SUPABASE_AT_RUNTIME !== "true";

function defaultForMethod(name: string) {
  if (/list|get|fetch|find|search/i.test(name)) return [];
  if (/create|upsert|insert|update|delete|save|log/i.test(name)) return null;
  return null;
}

const proxy = new Proxy(original as any, {
  get(target, prop: string) {
    const orig = (target as any)[prop];
    if (typeof orig !== "function") return orig;

    return async (...args: any[]) => {
      if (!SUPABASE_ENABLED) {
        logger.warn("safe_production_skipped", { method: prop, reason: "SUPABASE disabled at runtime" });
        return defaultForMethod(prop);
      }

      try {
        return await orig.apply(target, args);
      } catch (err) {
        logger.error("safe_production_error", { method: prop, error: (err as Error).message });
        try {
          return defaultForMethod(prop);
        } catch {
          return null;
        }
      }
    };
  }
});

export const safeProductionRepository = proxy as typeof original;

export default safeProductionRepository;
