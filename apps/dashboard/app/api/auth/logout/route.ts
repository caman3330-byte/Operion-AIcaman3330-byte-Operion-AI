import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { readPublicEnv } from "@/lib/env";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const tokenHeader = (() => {
      const auth = request.headers.get("authorization");
      if (auth?.startsWith("Bearer ")) return auth.slice("Bearer ".length);
      return null;
    })();

    const env = readPublicEnv();
    const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });

    // Server-side signOut does not accept an access token parameter in this
    // environment. For browser-initiated sign-outs, the client component
    // should call `supabase.auth.signOut()` which will clear auth cookies.
    // Here we call signOut as a best-effort for the current runtime.
    try {
      await supabase.auth.signOut();
    } catch (e) {
      // ignore
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as any)?.message ?? String(err) }, { status: 500 });
  }
}
