import { requireFounder } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Schema changes belong in versioned Supabase migrations, never in a runtime
 * HTTP endpoint. This legacy route is retained only as an explicit retirement
 * response so old clients cannot execute stale SQL against staging or
 * Production.
 */
export async function POST(request: Request) {
  try {
    await requireFounder(request);
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  return Response.json(
    {
      error: "Database migration endpoint is retired. Apply the versioned migrations through the migration workflow."
    },
    { status: 410 }
  );
}
