import { ValidationError } from "@/lib/errors";

export function parseProviderJson(text: string, operation: string) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)?.[1]?.trim();
  const candidate = fenced ?? trimmed;
  try {
    return JSON.parse(candidate);
  } catch {
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try {
        return JSON.parse(candidate.slice(start, end + 1));
      } catch {
        // The final validation error below gives the caller a safe preview.
      }
    }
  }

  throw new ValidationError("AI provider response was not valid JSON", {
    operation,
    preview: trimmed.slice(0, 500)
  });
}
