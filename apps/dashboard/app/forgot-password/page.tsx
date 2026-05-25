import { redirect } from "next/navigation";

export default function DeprecatedMerchantPasswordResetPage() {
  redirect("/apply?source=merchant_auth_removed");
}
