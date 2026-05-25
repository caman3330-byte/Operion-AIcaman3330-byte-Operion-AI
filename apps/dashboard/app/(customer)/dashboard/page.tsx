import { redirect } from "next/navigation";

export default function DeprecatedMerchantDashboardPage() {
  redirect("/thank-you?source=dashboard_deprecated");
}
