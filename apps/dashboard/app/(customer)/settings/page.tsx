import type { LucideIcon } from "lucide-react";
import { Bell, Building2, LockKeyhole, UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getCustomerWorkspaceData } from "@/lib/data/customer-workspace";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const workspace = await getCustomerWorkspaceData();
  const latestApplication = workspace.applications[0] ?? null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-normal text-white">Settings</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
          Customer account, business profile, notification, and security settings synced from Supabase.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SettingsPanel title="Profile" icon={UserRound}>
          <Field label="Full name" value={workspace.profile?.full_name ?? latestApplication?.owner_name ?? ""} />
          <Field label="Email" value={workspace.user?.email ?? latestApplication?.contact_email ?? ""} />
        </SettingsPanel>
        <SettingsPanel title="Business" icon={Building2}>
          <Field label="Business name" value={latestApplication?.business_name ?? ""} />
          <Field label="Industry" value={latestApplication?.industry ?? ""} />
        </SettingsPanel>
        <SettingsPanel title="Notifications" icon={Bell}>
          <div className="rounded-md border border-white/10 bg-white/[0.035] p-4 text-sm text-muted-foreground">
            Application status and document events are stored in the production notification architecture.
          </div>
        </SettingsPanel>
        <SettingsPanel title="Security" icon={LockKeyhole}>
          <div className="rounded-md border border-white/10 bg-white/[0.035] p-4 text-sm text-muted-foreground">
            Authentication and session persistence are managed by Supabase Auth.
          </div>
        </SettingsPanel>
      </div>
    </div>
  );
}

function SettingsPanel({ title, icon: Icon, children }: { title: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-white/10 bg-card/80 p-5">
      <div className="mb-5 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Icon className="h-5 w-5 text-primary" />
          <h2 className="font-semibold text-white">{title}</h2>
        </div>
        <Badge variant="outline">Supabase</Badge>
      </div>
      <div className="grid gap-4">{children}</div>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <Input value={value} readOnly />
    </div>
  );
}
