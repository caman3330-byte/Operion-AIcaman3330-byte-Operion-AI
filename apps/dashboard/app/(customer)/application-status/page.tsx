import { redirect } from "next/navigation";

export default function DeprecatedApplicationStatusPage() {
  redirect("/thank-you?source=application_status_deprecated");
}
