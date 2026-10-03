import { NextRequest, NextResponse } from "next/server";
import { requireFounder } from "@/lib/auth";
import { handleRouteError, ValidationError } from "@/lib/errors";
import { previewManualImport } from "@/lib/acquisition/manual-import";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    await requireFounder(request);
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new ValidationError("Attach a CSV or XLSX file as file.");
    return NextResponse.json({ data: previewManualImport(file.name, await file.arrayBuffer()) });
  } catch (error) {
    return handleRouteError(error);
  }
}
