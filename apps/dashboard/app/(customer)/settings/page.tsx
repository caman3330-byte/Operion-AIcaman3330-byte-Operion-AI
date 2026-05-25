import { redirect } from "next/navigation";

export default function DeprecatedMerchantSettingsPage() {
  redirect("/thank-you?source=settings_deprecated");
}
