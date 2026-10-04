import { requireFounder } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Schema changes belong in versioned Supabase migrations, never in a runtime
 * HTTP endpoint. This route remains as an explicit retirement response so an
 * old client cannot attempt to mutate schema through PostgREST.
 */
export async function POST(request: Request) {
  try {
    await requireFounder(request);
  } catch {
    return Response.json({ error: "Unauthorized" }, { status: 403 });
  }

  return Response.json(
    {
      error: "Schema finalization is retired. Apply the versioned database migrations through the migration workflow."
    },
    { status: 410 }
  );
}
