"use client";

import { useState } from "react";
import { LogOut } from "lucide-react";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function LogoutButton({ redirectTo = "/signin" }: { redirectTo?: string }) {
  const [loading, setLoading] = useState(false);

  async function handleLogout() {
    setLoading(true);
    const supabase = createSupabaseBrowserClient();
    await supabase.auth.signOut();
    window.location.assign(redirectTo);
  }

  return (
    <Button type="button" variant="ghost" size="icon" aria-label="Sign out" disabled={loading} onClick={handleLogout}>
      <LogOut className="h-4 w-4" />
    </Button>
  );
}
